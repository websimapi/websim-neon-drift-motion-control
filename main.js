import { World } from './world.js';
import { InputSystem } from './controls.js';
import { GameState } from './game-state.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Initialization
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const pipCanvas = document.getElementById('pip-canvas');
const startBtn = document.getElementById('start-btn');
const calibrationOverlay = document.getElementById('calibration-overlay');
const gameHud = document.getElementById('game-hud');
const loadingScreen = document.getElementById('loading-screen');

const world = new World(document.body);
const input = new InputSystem(videoElement, canvasElement, pipCanvas);
const game = new GameState(world, input);

// Setup VR Button
const xrButton = VRButton.createButton(world.renderer);
document.getElementById('xr-button-container').appendChild(xrButton);

// Calibration Loop
function calibrationLoop() {
    if (input.state.hasPose) {
        document.getElementById('tracking-status').innerText = "LOCKED";
        document.getElementById('tracking-status').style.color = "#00f3ff";
        startBtn.innerText = "START RACE";
        startBtn.disabled = false;
    } else {
        document.getElementById('tracking-status').innerText = "SEARCHING...";
        document.getElementById('tracking-status').style.color = "red";
    }
    
    if (!game.isPlaying) {
        requestAnimationFrame(calibrationLoop);
    }
}

// Start Game
startBtn.addEventListener('click', () => {
    input.calibrate();
    calibrationOverlay.classList.add('hidden');
    gameHud.classList.remove('hidden');
    game.start();
});

// Remove loader once stuff is ready-ish
setTimeout(() => {
    loadingScreen.classList.add('hidden');
    calibrationOverlay.classList.remove('hidden');
    calibrationLoop();
}, 2000);

// Main Loop
world.renderer.setAnimationLoop(() => {
    game.update();
    world.render();
});

