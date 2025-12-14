import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class World {
    constructor(container) {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x050510, 0.002);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 5, 10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Perf cap
        this.renderer.shadowMap.enabled = true;
        this.renderer.xr.enabled = true; // WebXR support
        container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Post Processing (Bloom)
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0.2;
        bloomPass.strength = 1.2;
        bloomPass.radius = 0.5;
        this.composer.addPass(bloomPass);

        // Track Data
        this.trackCurve = null;
        this.trackLength = 0;
        
        this.initTrack();
        this.initEnvironment();

        window.addEventListener('resize', this.onResize.bind(this));
    }

    initTrack() {
        // Procedural Spline Generation
        const points = [];
        let x = 0, y = 100, z = 0;
        for (let i = 0; i < 50; i++) {
            points.push(new THREE.Vector3(x, y, z));
            z -= 100; // Moving forward
            y -= 10 + Math.random() * 20; // Downhill
            x += (Math.random() - 0.5) * 100; // Winding
        }
        
        this.trackCurve = new THREE.CatmullRomCurve3(points);
        this.trackCurve.tension = 0.5;
        this.trackLength = this.trackCurve.getLength();

        // Create Geometry
        const extrudeSettings = {
            steps: 400,
            bevelEnabled: false,
            extrudePath: this.trackCurve
        };

        // Shape of the track cross-section (Ribbon)
        const shape = new THREE.Shape();
        const width = 15;
        shape.moveTo(-width, 0);
        shape.lineTo(width, 0);
        shape.lineTo(width, -1);
        shape.lineTo(-width, -1);

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Material with grid texture
        const loader = new THREE.TextureLoader();
        const gridTexture = loader.load('background_grid.png');
        gridTexture.wrapS = THREE.RepeatWrapping;
        gridTexture.wrapT = THREE.RepeatWrapping;
        gridTexture.repeat.set(4, 50);

        const material = new THREE.MeshStandardMaterial({
            map: gridTexture,
            color: 0x00f3ff,
            emissive: 0x0044aa,
            roughness: 0.1,
            metalness: 0.8,
            side: THREE.DoubleSide
        });

        const trackMesh = new THREE.Mesh(geometry, material);
        trackMesh.receiveShadow = true;
        this.scene.add(trackMesh);

        // Add Boost Pads visually
        this.boostPads = [];
        for (let i = 5; i < 45; i+=5) {
             const t = i / 50;
             const pos = this.trackCurve.getPoint(t);
             const tangent = this.trackCurve.getTangent(t);
             
             const padGeo = new THREE.PlaneGeometry(10, 10);
             const padMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
             const pad = new THREE.Mesh(padGeo, padMat);
             pad.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
             pad.lookAt(pos.clone().add(tangent));
             pad.rotateX(-Math.PI/2);
             
             this.scene.add(pad);
             this.boostPads.push({t, mesh: pad});
        }
    }

    initEnvironment() {
        // Floating blocks for ambience
        const geom = new THREE.BoxGeometry(10, 10, 10);
        const mat = new THREE.MeshStandardMaterial({ color: 0x222222, wireframe: true });
        
        for(let i=0; i<100; i++) {
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.set(
                (Math.random() - 0.5) * 500,
                (Math.random()) * 200 - 100,
                (Math.random() - 0.5) * 5000 - 500
            );
            this.scene.add(mesh);
        }
    }

    createPlayerMesh(isLocal = false) {
        const group = new THREE.Group();
        
        // Board
        const boardGeo = new THREE.BoxGeometry(1.5, 0.2, 3);
        const boardMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const board = new THREE.Mesh(boardGeo, boardMat);
        group.add(board);

        // Glow
        const glowGeo = new THREE.BoxGeometry(1.6, 0.1, 3.1);
        const glowMat = new THREE.MeshBasicMaterial({ color: isLocal ? 0x00f3ff : 0xff00ff });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.y = -0.1;
        group.add(glow);

        // Character (Simple representation)
        const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.5, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.0;
        group.add(body);
        
        // Shadow caster
        body.castShadow = true;
        board.castShadow = true;

        this.scene.add(group);
        return group;
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.composer.render();
    }
}

