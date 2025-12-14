import * as THREE from 'three';

export class GameState {
    constructor(world, input) {
        this.world = world;
        this.input = input;
        
        // Player State
        this.t = 0; // Progress along track (0 to 1)
        this.speed = 0;
        this.lateralOffset = 0;
        this.verticalOffset = 0;
        this.score = 0;
        this.multiplier = 1;

        this.maxSpeed = 0.0005; // Base units per frame roughly
        this.acceleration = 0.000001;
        this.friction = 0.99;
        
        this.playerMesh = world.createPlayerMesh(true);
        this.peers = {};

        // Audio
        this.engineSound = new Audio('hover_hum.mp3');
        this.engineSound.loop = true;
        this.engineSound.volume = 0;
        
        // WebSim Room
        this.room = window.websim.room;
        this.setupMultiplayer();

        this.isPlaying = false;
    }

    async setupMultiplayer() {
        // Initialize room (globally available)
        if (this.room) {
            await this.room.initialize();
            
            this.room.subscribePresence((presence) => {
                this.updatePeers(presence);
            });
        }
    }

    updatePeers(presence) {
        // Handle new/removed peers
        Object.keys(presence).forEach(id => {
            if (id === this.room.clientId) return;
            
            const pData = presence[id];
            if (!this.peers[id]) {
                this.peers[id] = {
                    mesh: this.world.createPlayerMesh(false),
                    data: pData
                };
            }
            
            // Update peer position logic would go here, interpolated
            const peer = this.peers[id];
            if (pData.t !== undefined) {
                this.updateMeshPosition(peer.mesh, pData.t, pData.lateralOffset || 0, 0);
            }
        });

        // Cleanup disconnected
        Object.keys(this.peers).forEach(id => {
            if (!presence[id]) {
                this.world.scene.remove(this.peers[id].mesh);
                delete this.peers[id];
            }
        });
    }

    start() {
        this.isPlaying = true;
        this.engineSound.play().catch(e => console.log("Audio play failed interaction required"));
    }

    update(dt) {
        if (!this.isPlaying) return;

        const controls = this.input.getControlState();

        // 1. Physics - Speed
        // Gravity acceleration (simulated by track slope roughly)
        // We just accelerate constantly for this arcade feel
        this.speed += this.acceleration;
        
        // Boosts
        // Check boost pads overlap (simple distance check based on 't')
        // ... (omitted for brevity, would check this.world.boostPads)

        this.speed *= this.friction; // Air resistance
        this.speed = Math.min(this.speed, this.maxSpeed * 2);

        // 2. Physics - Movement
        this.t += this.speed;
        
        // Loop track for demo
        if (this.t >= 1) this.t = 0;

        // Lateral Movement (Steering)
        const steerForce = controls.steer * 0.5; // Sensitivity
        this.lateralOffset -= steerForce;
        this.lateralOffset = Math.max(-12, Math.min(12, this.lateralOffset)); // Track width limits

        // Jump / Vertical
        if (controls.jump && this.verticalOffset <= 0) {
            // Initiate jump
            this.verticalVelocity = 0.5;
        }

        // Apply simple gravity to vertical
        if (this.verticalOffset > 0 || this.verticalVelocity > 0) {
            this.verticalOffset += this.verticalVelocity;
            this.verticalVelocity -= 0.02; // Gravity
            if (this.verticalOffset < 0) {
                this.verticalOffset = 0;
                this.verticalVelocity = 0;
            }
        }

        // 3. Update Visuals
        this.updateMeshPosition(this.playerMesh, this.t, this.lateralOffset, this.verticalOffset);
        
        // Camera Follow
        this.updateCamera(controls);

        // Audio
        this.engineSound.volume = Math.min(1, this.speed * 2000);

        // 4. Network Sync (Throttle this in a real app)
        if (this.room) {
            this.room.updatePresence({
                t: this.t,
                lateralOffset: this.lateralOffset,
                verticalOffset: this.verticalOffset
            });
        }

        // 5. HUD Updates
        this.updateHUD();
    }

    updateMeshPosition(mesh, t, lateral, vertical) {
        if (!this.world.trackCurve) return;

        const pos = this.world.trackCurve.getPointAt(t);
        const tangent = this.world.trackCurve.getTangentAt(t);
        const up = new THREE.Vector3(0, 1, 0);
        
        // Calculate right vector for lateral movement
        const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
        
        // Apply offsets
        const finalPos = pos.clone()
            .add(right.multiplyScalar(lateral))
            .add(up.multiplyScalar(vertical));

        mesh.position.copy(finalPos);
        
        // Orientation
        // Look ahead
        const lookT = Math.min(1, t + 0.01);
        const lookPos = this.world.trackCurve.getPointAt(lookT);
        mesh.lookAt(lookPos.add(right.multiplyScalar(lateral))); // Look parallel to track at offset
        
        // Bank (Roll) based on steering
        const roll = lateral * -0.05;
        mesh.rotateZ(roll);
    }

    updateCamera(controls) {
        // Chase camera
        const relativeOffset = new THREE.Vector3(0, 5, -10);
        
        // We want the camera to be behind the player, but smooth
        const playerPos = this.playerMesh.position;
        const playerRot = this.playerMesh.rotation;
        
        // Simple follow for now: slightly behind and up based on track tangent
        const t = this.t;
        const tangent = this.world.trackCurve.getTangentAt(t).normalize();
        
        const camPos = playerPos.clone().sub(tangent.multiplyScalar(15)).add(new THREE.Vector3(0, 8, 0));
        
        this.world.camera.position.lerp(camPos, 0.1);
        this.world.camera.lookAt(playerPos);
    }

    updateHUD() {
        const kmh = Math.floor(this.speed * 100000);
        document.getElementById('speed-display').innerText = kmh;
        document.getElementById('score-display').innerText = Math.floor(this.t * 10000);
        document.getElementById('lean-val').innerText = Math.floor(this.input.state.lean * 100) / 100;
    }
}

