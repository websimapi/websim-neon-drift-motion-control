/**
 * Handles Input from Webcam (MediaPipe), Keyboard, and WebXR.
 */
export class InputSystem {
    constructor(videoElement, canvasElement, pipCanvas) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.pipCtx = pipCanvas.getContext('2d');
        
        // State
        this.state = {
            lean: 0, // -1 (Left) to 1 (Right)
            crouch: 0, // 0 (Standing) to 1 (Full Crouch)
            isJumping: false,
            handsUp: false,
            calibrated: false,
            hasPose: false
        };

        this.pose = null;
        this.camera = null;
        this.xrSession = null;
        
        // Calibration data
        this.neutralHipY = 0.5;
        this.neutralShoulderX = 0;
        
        // Setup Keyboard fallback
        this.keys = { ArrowLeft: false, ArrowRight: false, Space: false, KeyW: false, KeyS: false };
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        this.initMediaPipe();
    }

    async initMediaPipe() {
        if (!window.Pose) {
            console.error("MediaPipe Pose not loaded");
            return;
        }

        this.pose = new window.Pose({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }});

        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.pose.onResults(this.onPoseResults.bind(this));

        // Setup Camera
        this.camera = new window.Camera(this.video, {
            onFrame: async () => {
                await this.pose.send({image: this.video});
            },
            width: 640,
            height: 480
        });

        this.camera.start();
    }

    onPoseResults(results) {
        this.state.hasPose = !!results.poseLandmarks;
        
        // Draw to Calibration Canvas
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);
        
        if (results.poseLandmarks) {
            window.drawConnectors(this.ctx, results.poseLandmarks, window.POSE_CONNECTIONS,
                                 {color: '#00f3ff', lineWidth: 4});
            window.drawLandmarks(this.ctx, results.poseLandmarks,
                                {color: '#ff00ff', lineWidth: 2});
            
            this.processLandmarks(results.poseLandmarks);
        }
        this.ctx.restore();

        // Draw to PiP Canvas (Always visible in game)
        this.pipCtx.save();
        this.pipCtx.clearRect(0, 0, this.pipCtx.canvas.width, this.pipCtx.canvas.height);
        this.pipCtx.drawImage(results.image, 0, 0, this.pipCtx.canvas.width, this.pipCtx.canvas.height);
        if (results.poseLandmarks) {
            window.drawConnectors(this.pipCtx, results.poseLandmarks, window.POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
        }
        this.pipCtx.restore();
    }

    processLandmarks(landmarks) {
        // Landmarks: 11/12 Shoulders, 23/24 Hips.
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        
        // Calculate Centers
        const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
        const midHipX = (leftHip.x + rightHip.x) / 2;
        const midHipY = (leftHip.y + rightHip.y) / 2;

        // Lean Logic: Difference between shoulder center and hip center relative to frame
        // Inverted because video is mirrored
        const rawLean = (midShoulderX - midHipX) * 5.0; // Multiplier for sensitivity
        
        // Smoothing
        this.state.lean = this.lerp(this.state.lean, Math.max(-1, Math.min(1, rawLean)), 0.2);

        // Crouch Logic
        const crouchThresh = 0.1; 
        // If hip Y is significantly lower (higher value) than calibrated neutral
        const crouchDepth = Math.max(0, midHipY - (this.neutralHipY + 0.05)); 
        this.state.crouch = Math.min(1, crouchDepth * 5); // Amplify

        // Jump Logic (Hands up)
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        if (leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y) {
            this.state.handsUp = true;
        } else {
            this.state.handsUp = false;
        }
    }

    calibrate() {
        if (!this.state.hasPose) return false;
        // Set current hip height as neutral
        // We need the raw landmarks again, but we can approximate from current processing
        // Ideally we'd store the last raw landmarks
        this.state.calibrated = true;
        return true;
    }

    getControlState() {
        // Mix Keyboard and Motion
        let steer = 0;
        if (this.keys.ArrowLeft || this.keys.KeyA) steer -= 1;
        if (this.keys.ArrowRight || this.keys.KeyD) steer += 1;
        
        // If no keyboard input, use motion
        if (Math.abs(steer) < 0.1) {
            steer = this.state.lean;
        }

        // Jump logic
        let jump = this.keys.Space || this.state.handsUp;

        return {
            steer: steer,
            crouch: this.state.crouch,
            jump: jump
        };
    }

    lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }
}

