import * as THREE from 'three';
import * as CANNON from 'cannon-es';

class BasketballGame {
    constructor() {
        // Three.js setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);  // Light blue sky color
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('gameCanvas'),
            antialias: true
        });
        
        // Essential renderer settings
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Physics world setup
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.82, 0)
        });
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;

        // Game state
        this.score = 0;
        this.power = 0;
        this.isPoweringUp = false;
        this.isShot = false;
        this.ballPassedThroughHoop = false;
        this.shotMeterProgress = 0;
        this.perfectReleaseZone = { start: 0.85, end: 0.95 }; // Sweet spot for release
        this.shotMeterSpeed = 1.5; // Speed of shot meter fill
        this.scoreDisplay = document.getElementById('scoreDisplay');
        this.powerBar = document.getElementById('powerBar');

        // Create shot meter UI
        this.setupShotMeter();

        // Setup game elements in correct order
        this.setupLights();
        this.setupGym();
        this.setupCourt();
        this.setupHoop();
        this.setupPlayer(); // Setup player before ball
        this.setupCamera();
        this.setupBall();   // Setup ball after player
        this.setupScoreboard();

        // Event listeners
        this.setupEventListeners();
        
        // Add clock for delta time calculation
        this.clock = new THREE.Clock();
        this.fixedTimeStep = 1/60;  // Fixed time step for physics (60 Hz)
        this.maxSubSteps = 3;       // Maximum number of substeps per frame

        // Start game loop
        this.animate();
    }

    setupShotMeter() {
        this.shotMeter = document.createElement('div');
        this.shotMeter.style.cssText = `
            position: fixed;
            right: 50px;
            top: 50%;
            width: 10px;
            height: 200px;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid white;
            display: none;
        `;
        
        this.shotMeterFill = document.createElement('div');
        this.shotMeterFill.style.cssText = `
            position: absolute;
            bottom: 0;
            width: 100%;
            background: linear-gradient(to top, #ff4444, #44ff44, #ff4444);
            transition: height 0.05s linear;
        `;
        
        this.perfectZoneIndicator = document.createElement('div');
        this.perfectZoneIndicator.style.cssText = `
            position: absolute;
            width: 100%;
            height: 10%;
            background: rgba(255, 255, 255, 0.5);
            bottom: ${this.perfectReleaseZone.start * 100}%;
        `;
        
        this.shotMeter.appendChild(this.perfectZoneIndicator);
        this.shotMeter.appendChild(this.shotMeterFill);
        document.body.appendChild(this.shotMeter);
    }

    setupLights() {
        // Increase ambient light intensity
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambient);

        // Adjust directional light
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(5, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 100;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        this.scene.add(dirLight);

        // Add a hemisphere light for better ambient lighting
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);
    }

    setupGym() {
        // Floor
        const floorGeometry = new THREE.PlaneGeometry(40, 30);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;  // Base floor at y=0
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Walls
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0xe8e8e8,
            roughness: 0.5,
            metalness: 0.1
        });

        // Back wall (behind hoop)
        const backWallGeometry = new THREE.PlaneGeometry(40, 15);
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, 7.5, -15);
        backWall.receiveShadow = true;
        this.scene.add(backWall);

        // Front wall
        const frontWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        frontWall.position.set(0, 7.5, 15);
        frontWall.rotation.y = Math.PI;
        frontWall.receiveShadow = true;
        this.scene.add(frontWall);

        // Side walls
        const sideWallGeometry = new THREE.PlaneGeometry(30, 15);
        const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        leftWall.position.set(-20, 7.5, 0);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.receiveShadow = true;
        this.scene.add(leftWall);

        const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        rightWall.position.set(20, 7.5, 0);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.receiveShadow = true;
        this.scene.add(rightWall);

        // Ceiling
        const ceilingGeometry = new THREE.PlaneGeometry(40, 30);
        const ceilingMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.9,
            metalness: 0.1
        });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.position.set(0, 15, 0);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.receiveShadow = true;
        this.scene.add(ceiling);

        // Add wall physics with proper material
        const wallMaterialPhysics = new CANNON.Material({
            friction: 0.3,
            restitution: 0.6
        });

        const wallShape = new CANNON.Box(new CANNON.Vec3(20, 7.5, 0.1));
        const sideWallShape = new CANNON.Box(new CANNON.Vec3(0.1, 7.5, 15));

        // Back wall physics
        const backWallBody = new CANNON.Body({ 
            mass: 0,
            material: wallMaterialPhysics
        });
        backWallBody.addShape(wallShape);
        backWallBody.position.set(0, 7.5, -15);
        this.world.addBody(backWallBody);

        // Front wall physics
        const frontWallBody = new CANNON.Body({ 
            mass: 0,
            material: wallMaterialPhysics
        });
        frontWallBody.addShape(wallShape);
        frontWallBody.position.set(0, 7.5, 15);
        this.world.addBody(frontWallBody);

        // Side walls physics
        const leftWallBody = new CANNON.Body({ 
            mass: 0,
            material: wallMaterialPhysics
        });
        leftWallBody.addShape(sideWallShape);
        leftWallBody.position.set(-20, 7.5, 0);
        this.world.addBody(leftWallBody);

        const rightWallBody = new CANNON.Body({ 
            mass: 0,
            material: wallMaterialPhysics
        });
        rightWallBody.addShape(sideWallShape);
        rightWallBody.position.set(20, 7.5, 0);
        this.world.addBody(rightWallBody);
    }

    setupCourt() {
        // Court floor with texture
        const courtGeometry = new THREE.PlaneGeometry(30, 20);
        const courtMaterial = new THREE.MeshStandardMaterial({
            color: 0xD96B2B,
            roughness: 0.8,
            metalness: 0.1
        });
        this.court = new THREE.Mesh(courtGeometry, courtMaterial);
        this.court.rotation.x = -Math.PI / 2;
        this.court.position.y = 0.001;  // Slightly above the base floor
        this.court.receiveShadow = true;
        this.scene.add(this.court);

        // Three-point line
        const curve = new THREE.EllipseCurve(
            0, 0,             // Center
            6.75, 6.75,       // X and Y radius
            -Math.PI, 0,      // Start and end angle
            false            // Counter-clockwise
        );
        const points = curve.getPoints(50);
        const threePointGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const threePointMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffffff,
            linewidth: 2
        });
        const threePointLine = new THREE.Line(threePointGeometry, threePointMaterial);
        threePointLine.rotation.x = -Math.PI / 2;
        threePointLine.position.y = 0.002;  // Slightly above the court
        threePointLine.position.z = -8.5;  // Align with basket
        this.scene.add(threePointLine);

        // Physics floor (keep at y=0)
        const floorShape = new CANNON.Plane();
        const floorBody = new CANNON.Body({
            mass: 0,
            shape: floorShape,
            material: new CANNON.Material({
                friction: 0.3,
                restitution: 0.3
            })
        });
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(floorBody);
    }

    setupHoop() {
        // Backboard
        const backboardGeometry = new THREE.BoxGeometry(3, 2, 0.1);
        const backboardMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        this.backboard = new THREE.Mesh(backboardGeometry, backboardMaterial);
        this.backboard.position.set(0, 3, -9);
        this.backboard.castShadow = true;
        this.scene.add(this.backboard);

        // Rim
        const rimGeometry = new THREE.TorusGeometry(0.45, 0.04, 16, 32);
        const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
        this.rim = new THREE.Mesh(rimGeometry, rimMaterial);
        this.rim.position.set(0, 2.5, -8.5);
        this.rim.rotation.x = Math.PI / 2;
        this.scene.add(this.rim);

        // Net (using cylindrical segments)
        const netGeometry = new THREE.CylinderGeometry(0.45, 0.3, 0.6, 16, 8, true);
        const netMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            wireframe: true
        });
        this.net = new THREE.Mesh(netGeometry, netMaterial);
        this.net.position.set(0, 2.2, -8.5);
        this.scene.add(this.net);

        // Support pole structure
        const poleMaterial = new THREE.MeshStandardMaterial({
            color: 0x2c3e50,  // Dark blue-grey color
            roughness: 0.7,
            metalness: 0.3
        });

        // Main vertical pole
        const mainPoleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 3, 16);  // Changed from 6 to 3
        const mainPole = new THREE.Mesh(mainPoleGeometry, poleMaterial);
        mainPole.position.set(0, 1.5, -9.5);  // Changed y from 3 to 1.5 to center the shorter pole
        mainPole.castShadow = true;
        this.scene.add(mainPole);

        // Horizontal extension (the part that extends from the pole to the backboard)
        const horizontalPoleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 16);
        const horizontalPole = new THREE.Mesh(horizontalPoleGeometry, poleMaterial);
        horizontalPole.rotation.z = Math.PI / 2;
        horizontalPole.position.set(0, 3, -9.15);
        horizontalPole.castShadow = true;
        this.scene.add(horizontalPole);

        // Support brackets (connecting horizontal to backboard)
        const bracketMaterial = new THREE.MeshStandardMaterial({
            color: 0x34495e,  // Slightly darker than the pole
            roughness: 0.8,
            metalness: 0.4
        });

        // Upper bracket
        const upperBracketGeometry = new THREE.BoxGeometry(0.8, 0.1, 0.1);
        const upperBracket = new THREE.Mesh(upperBracketGeometry, bracketMaterial);
        upperBracket.position.set(0, 3.5, -9.05);
        upperBracket.castShadow = true;
        this.scene.add(upperBracket);

        // Lower bracket
        const lowerBracketGeometry = new THREE.BoxGeometry(0.8, 0.1, 0.1);
        const lowerBracket = new THREE.Mesh(lowerBracketGeometry, bracketMaterial);
        lowerBracket.position.set(0, 2.5, -9.05);
        lowerBracket.castShadow = true;
        this.scene.add(lowerBracket);

        // Base support (wider base at the bottom)
        const baseGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.4, 16);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x2c3e50,
            roughness: 0.9,
            metalness: 0.2
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(0, 0.2, -9.5);
        base.castShadow = true;
        this.scene.add(base);

        // Physics bodies for hoop
        const backboardShape = new CANNON.Box(new CANNON.Vec3(1.5, 1, 0.05));
        const backboardBody = new CANNON.Body({ mass: 0 });
        backboardBody.addShape(backboardShape);
        backboardBody.position.set(0, 3, -9);
        this.world.addBody(backboardBody);

        // Pole physics (simplified collision box)
        const poleShape = new CANNON.Box(new CANNON.Vec3(0.15, 3, 0.15));
        const poleBody = new CANNON.Body({ mass: 0 });
        poleBody.addShape(poleShape);
        poleBody.position.set(0, 3, -9.5);
        this.world.addBody(poleBody);

        // Create rim physics using a compound shape
        const rimBody = new CANNON.Body({ mass: 0 });
        
        // Create rim segments using a torus approximation
        const rimSegments = 16;
        const rimRadius = 0.45;
        const rimTubeRadius = 0.04;
        
        for (let i = 0; i < rimSegments; i++) {
            const angle = (i / rimSegments) * Math.PI * 2;
            const nextAngle = ((i + 1) / rimSegments) * Math.PI * 2;
            
            // Create a box between current angle and next angle
            const midAngle = (angle + nextAngle) / 2;
            const segmentLength = 2 * rimRadius * Math.sin(Math.PI / rimSegments);
            
            const segmentShape = new CANNON.Box(new CANNON.Vec3(
                segmentLength / 2,
                rimTubeRadius,
                rimTubeRadius
            ));
            
            // Position and rotate the segment
            const offset = new CANNON.Vec3(
                rimRadius * Math.cos(midAngle),
                0,
                rimRadius * Math.sin(midAngle)
            );
            
            const segmentRotation = new CANNON.Quaternion();
            segmentRotation.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -midAngle);
            
            rimBody.addShape(segmentShape, offset, segmentRotation);
        }
        
        rimBody.position.set(0, 2.5, -8.5);
        this.world.addBody(rimBody);
        this.rimBody = rimBody;  // Store reference for collision detection

        // Create trigger volumes for score detection
        const topTriggerShape = new CANNON.Cylinder(0.45, 0.45, 0.1, 16);
        this.topTrigger = new CANNON.Body({
            isTrigger: true,
            mass: 0,
            shape: topTriggerShape,
            collisionResponse: false  // This makes it a ghost object that doesn't affect physics
        });
        this.topTrigger.position.set(0, 2.6, -8.5);  // Slightly above rim
        this.world.addBody(this.topTrigger);

        const bottomTriggerShape = new CANNON.Cylinder(0.45, 0.45, 0.1, 16);
        this.bottomTrigger = new CANNON.Body({
            isTrigger: true,
            mass: 0,
            shape: bottomTriggerShape,
            collisionResponse: false  // This makes it a ghost object that doesn't affect physics
        });
        this.bottomTrigger.position.set(0, 2.4, -8.5);  // Slightly below rim
        this.world.addBody(this.bottomTrigger);

        // Set up collision detection for scoring
        this.ballAboveRim = false;
        this.ballBelowRim = false;
        
        // Add contact event listeners
        this.world.addEventListener('beginContact', (event) => {
            if ((event.bodyA === this.ballBody && event.bodyB === this.topTrigger) ||
                (event.bodyB === this.ballBody && event.bodyA === this.topTrigger)) {
                this.ballAboveRim = true;
            }
            if ((event.bodyA === this.ballBody && event.bodyB === this.bottomTrigger) ||
                (event.bodyB === this.ballBody && event.bodyA === this.bottomTrigger)) {
                this.ballBelowRim = true;
                // Check for scoring
                if (this.ballAboveRim && !this.ballPassedThroughHoop && this.ballBody.velocity.y < 0) {
                    this.ballPassedThroughHoop = true;
                    this.score += this.isThreePointer() ? 3 : 2;
                    this.scoreDisplay.textContent = this.score;
                    this.updateScoreboardDisplay();
                    this.createScoreEffect();
                }
            }
        });
    }

    setupPlayer() {
        // Create a more realistic player model
        // Body (torso)
        const torsoGeometry = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 8);
        const jerseyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4169e1, // Royal blue jersey
            roughness: 0.7,
            metalness: 0.3
        });
        this.playerBody = new THREE.Mesh(torsoGeometry, jerseyMaterial);
        this.playerBody.position.y = 1.2;
        this.playerBody.castShadow = true;

        // Head with neck
        const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
        const skinMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xe8c39e,  // More natural Asian skin tone, less yellow
            roughness: 0.8,
            metalness: 0.1
        });
        this.playerHead = new THREE.Mesh(headGeometry, skinMaterial);
        this.playerHead.position.y = 1.85;
        this.playerHead.castShadow = true;

        // Neck
        const neckGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8);
        this.neck = new THREE.Mesh(neckGeometry, skinMaterial);
        this.neck.position.y = 1.7;
        this.neck.castShadow = true;

        // Legs with better proportions
        const shortsMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4169e1, // Matching shorts
            roughness: 0.7,
            metalness: 0.3
        });

        const upperLegGeometry = new THREE.CylinderGeometry(0.09, 0.07, 0.4, 8);
        const lowerLegGeometry = new THREE.CylinderGeometry(0.07, 0.06, 0.4, 8);

        // Left leg
        this.leftUpperLeg = new THREE.Mesh(upperLegGeometry, shortsMaterial);
        this.leftUpperLeg.position.set(-0.15, 0.8, 0);
        this.leftUpperLeg.castShadow = true;

        this.leftLowerLeg = new THREE.Mesh(lowerLegGeometry, skinMaterial);
        this.leftLowerLeg.position.set(-0.15, 0.4, 0);
        this.leftLowerLeg.castShadow = true;

        // Right leg
        this.rightUpperLeg = new THREE.Mesh(upperLegGeometry, shortsMaterial);
        this.rightUpperLeg.position.set(0.15, 0.8, 0);
        this.rightUpperLeg.castShadow = true;

        this.rightLowerLeg = new THREE.Mesh(lowerLegGeometry, skinMaterial);
        this.rightLowerLeg.position.set(0.15, 0.4, 0);
        this.rightLowerLeg.castShadow = true;

        // Feet
        const footGeometry = new THREE.BoxGeometry(0.12, 0.05, 0.2);
        const shoeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a, // Black shoes
            roughness: 0.8,
            metalness: 0.2
        });

        this.leftFoot = new THREE.Mesh(footGeometry, shoeMaterial);
        this.leftFoot.position.set(-0.15, 0.15, 0.02);
        this.leftFoot.castShadow = true;

        this.rightFoot = new THREE.Mesh(footGeometry, shoeMaterial);
        this.rightFoot.position.set(0.15, 0.15, 0.02);
        this.rightFoot.castShadow = true;

        // Add arms for shooting animation
        const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
        this.rightArm = new THREE.Mesh(armGeometry, jerseyMaterial);
        this.rightArm.position.set(0.35, 1.4, 0);
        this.rightArm.rotation.z = -Math.PI / 3;  // Default arm position
        this.rightArm.castShadow = true;

        this.leftArm = new THREE.Mesh(armGeometry, jerseyMaterial);
        this.leftArm.position.set(-0.35, 1.4, 0);
        this.leftArm.rotation.z = Math.PI / 3;  // Default arm position
        this.leftArm.castShadow = true;

        // Create player group and add all parts
        this.player = new THREE.Group();
        this.player.add(this.playerBody);
        this.player.add(this.playerHead);
        this.player.add(this.neck);
        this.player.add(this.leftUpperLeg);
        this.player.add(this.leftLowerLeg);
        this.player.add(this.rightUpperLeg);
        this.player.add(this.rightLowerLeg);
        this.player.add(this.leftFoot);
        this.player.add(this.rightFoot);
        this.player.add(this.leftArm);
        this.player.add(this.rightArm);
        
        // Position the entire player at ground level
        this.player.position.set(0, 0, 0);
        this.scene.add(this.player);

        // Player state
        this.playerState = {
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            isJumping: false,
            jumpVelocity: 0,
            onGround: true,
            shootingAnimation: false
        };
    }

    setupCamera() {
        // Position camera higher and further back for better view
        this.camera.position.set(0, 6, 12);
        this.camera.lookAt(0, 2, 0);
    }

    setupBall() {
        // Visual ball - make it slightly larger and more visible
        const ballRadius = 0.15; // Increased from previous size
        const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
        const ballMaterial = new THREE.MeshStandardMaterial({
            color: 0xff6b00, // Bright orange
            roughness: 0.4, // More shiny
            metalness: 0.2
        });
        this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.ball.castShadow = true;
        this.scene.add(this.ball);

        // Physics ball
        const ballShape = new CANNON.Sphere(ballRadius);
        this.ballBody = new CANNON.Body({
            mass: 1,
            shape: ballShape,
            position: new CANNON.Vec3(0, 1.5, 0), // Start higher up
            material: new CANNON.Material({
                restitution: 0.8,
                friction: 0.5
            })
        });
        this.world.addBody(this.ballBody);

        // Set initial ball position
        this.resetBall();
    }

    setupScoreboard() {
        // Create scoreboard geometry
        const scoreboardGeometry = new THREE.BoxGeometry(4, 2, 0.2);
        const scoreboardMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 0.5,
            metalness: 0.5
        });
        this.scoreboard = new THREE.Mesh(scoreboardGeometry, scoreboardMaterial);
        this.scoreboard.position.set(0, 8, -14.8); // Position above the hoop
        this.scene.add(this.scoreboard);

        // Create digital display texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        this.scoreboardContext = canvas.getContext('2d');
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const displayGeometry = new THREE.PlaneGeometry(3.8, 1.8);
        const displayMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true
        });
        
        this.scoreboardDisplay = new THREE.Mesh(displayGeometry, displayMaterial);
        this.scoreboardDisplay.position.set(0, 8, -14.69); // Moved slightly forward from the scoreboard
        this.scene.add(this.scoreboardDisplay);
        
        this.updateScoreboardDisplay();
    }

    updateScoreboardDisplay() {
        const ctx = this.scoreboardContext;
        const canvas = ctx.canvas;
        
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw border
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
        
        // Set up text
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw score
        ctx.fillText(this.score.toString().padStart(3, '0'), canvas.width / 2, canvas.height / 2);
        
        // Update texture
        this.scoreboardDisplay.material.map.needsUpdate = true;
    }

    shoot() {
        if (this.isShot) return;

        // Start shooting animation
        this.playerState.shootingAnimation = true;
        this.animateShot();
        this.isShot = true;

        // Calculate direction to basket (at rim position) from ball's current position
        const basketPosition = new THREE.Vector3(0, 2.5, -8.5);
        const ballPosition = new THREE.Vector3(
            this.ballBody.position.x,
            this.ballBody.position.y,
            this.ballBody.position.z
        );
        const shotDirection = new THREE.Vector3();
        shotDirection.subVectors(basketPosition, ballPosition).normalize();

        // Calculate distance to basket from ball's position
        const distanceToBasket = new THREE.Vector2(
            ballPosition.x - basketPosition.x,
            ballPosition.z - basketPosition.z
        ).length();

        // Get the release quality which affects power
        const releaseQuality = this.calculateReleaseQuality(distanceToBasket);

        // Using projectile motion equation for perfect velocity:
        // v0^2 = (g * d^2) / (2 * cos^2(θ) * (d * tan(θ) - (h - h0)))
        const g = 9.81; // gravity (m/s^2)
        const h0 = ballPosition.y; // initial height (ball's current height)
        const h = basketPosition.y; // target height (basket)
        const d = distanceToBasket; // horizontal distance to target

        const perfectVelocity = Math.sqrt(
            (g * d * d) / 
            (2 * Math.cos(releaseQuality.optimalAngle) * Math.cos(releaseQuality.optimalAngle) * 
            (d * Math.tan(releaseQuality.optimalAngle) - (h - h0)))
        );
        
        // Apply power multiplier based on release quality only
        const actualVelocity = perfectVelocity * releaseQuality.powerMultiplier;
        
        // Calculate velocity components
        const vx = actualVelocity * Math.cos(releaseQuality.optimalAngle);
        const vy = actualVelocity * Math.sin(releaseQuality.optimalAngle);

        // Set the final velocity
        const velocity = new CANNON.Vec3(
            shotDirection.x * vx,
            vy,
            shotDirection.z * vx
        );
        
        this.ballBody.velocity.copy(velocity);

        // Add spin - more predictable now
        const spinForce = releaseQuality.isPerfect ? 1.5 : 1.0;
        this.ballBody.angularVelocity.set(
            0,              // no random x-axis spin
            -spinForce,     // consistent backspin
            0               // no random z-axis spin
        );

        // Visual feedback
        this.showReleaseIndicator(releaseQuality.isPerfect, releaseQuality.powerMultiplier, releaseQuality.shotResult);
        
        // Screen shake only for very strong shots
        if (releaseQuality.powerMultiplier > 1.3) {
            this.addScreenShake(0.1, 100);
        }
    }

    calculateReleaseQuality(distanceToBasket) {
        const progress = this.shotMeterProgress;
        const perfectStart = this.perfectReleaseZone.start;
        const perfectEnd = this.perfectReleaseZone.end;
        const perfectMiddle = (perfectStart + perfectEnd) / 2;
        
        // Perfect release = exactly 1.0 power
        if (progress >= perfectStart && progress <= perfectEnd) {
            return {
                isPerfect: true,
                powerMultiplier: 1.0,
                shotResult: 'PERFECT!',
                optimalAngle: Math.PI / 4
            };
        }
        
        // Linear power scaling
        let powerMultiplier, shotResult;
        
        if (progress < perfectStart) {
            // Linear scaling from 0.7 to 0.95 for weak shots
            powerMultiplier = 0.7 + (progress / perfectStart) * 0.25;
            
            // Calculate how weak the shot is
            const weakness = (perfectStart - progress) / perfectStart;
            if (weakness > 0.66) shotResult = 'WAY TOO WEAK!';
            else if (weakness > 0.33) shotResult = 'TOO WEAK!';
            else shotResult = 'SLIGHTLY WEAK';
            
        } else {
            // Linear scaling from 1.05 to 1.3 for strong shots
            const excessProgress = (progress - perfectEnd) / (1 - perfectEnd);
            powerMultiplier = 1.05 + excessProgress * 0.25;
            
            // Calculate how strong the shot is
            const strength = (progress - perfectEnd) / (1 - perfectEnd);
            if (strength > 0.66) shotResult = 'WAY TOO STRONG!';
            else if (strength > 0.33) shotResult = 'TOO STRONG!';
            else shotResult = 'SLIGHTLY STRONG';
        }
        
        // Calculate optimal angle based on distance
        // Closer shots need steeper angles
        const baseAngle = Math.PI / 3; // Changed from Math.PI / 4 to Math.PI / 3 (60 degrees base instead of 45)
        const optimalAngle = baseAngle + Math.min(0.3, distanceToBasket * 0.015); // Increased angle adjustment for distance
        
        return {
            isPerfect: false,
            powerMultiplier,
            shotResult,
            optimalAngle
        };
    }

    addScreenShake(intensity, duration) {
        const originalPos = this.camera.position.clone();
        let elapsed = 0;
        
        const shakeAnimation = () => {
            elapsed += 16;
            if (elapsed < duration) {
                const shake = intensity * (1 - elapsed / duration);
                this.camera.position.set(
                    originalPos.x + (Math.random() - 0.5) * shake,
                    originalPos.y + (Math.random() - 0.5) * shake,
                    originalPos.z + (Math.random() - 0.5) * shake
                );
                requestAnimationFrame(shakeAnimation);
            } else {
                this.camera.position.copy(originalPos);
            }
        };
        
        requestAnimationFrame(shakeAnimation);
    }

    showReleaseIndicator(isPerfect, powerMultiplier, shotResult) {
        const indicator = document.createElement('div');
        
        // Calculate distance to basket for context
        const basketPosition = new THREE.Vector3(0, 2.5, -8.5);
        const distanceToBasket = new THREE.Vector2(
            this.playerState.position.x - basketPosition.x,
            this.playerState.position.z - basketPosition.z
        ).length();

        // Format power percentage
        const powerPercentage = Math.round(powerMultiplier * 100);
        
        indicator.style.cssText = `
            position: fixed;
            left: 50%;
            top: 40%;
            transform: translate(-50%, -50%);
            font-size: 24px;
            color: ${isPerfect ? '#44ff44' : '#ffffff'};
            text-shadow: 0 0 10px ${isPerfect ? '#44ff44' : '#ffffff'};
            opacity: 1;
            transition: opacity 0.5s, transform 0.5s;
            text-align: center;
        `;
        
        // Create three lines of text
        indicator.innerHTML = `
            <div>${shotResult}</div>
            <div style="font-size: 18px; margin-top: 5px;">Power: ${powerPercentage}%</div>
            <div style="font-size: 16px; margin-top: 5px;">Distance: ${Math.round(distanceToBasket * 10) / 10}m</div>
        `;
        
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            indicator.style.opacity = '0';
            indicator.style.transform = 'translate(-50%, -100%)';
            setTimeout(() => indicator.remove(), 500);
        }, 1000);
    }

    animateShot() {
        if (!this.playerState.shootingAnimation) return;

        // Store initial arm rotations
        const initialLeftArmRotation = this.leftArm.rotation.z;
        const initialRightArmRotation = this.rightArm.rotation.z;

        // Shooting animation sequence
        const prepareShot = () => {
            // Move arms back for shot preparation
            this.leftArm.rotation.z = Math.PI / 2;
            this.rightArm.rotation.z = -Math.PI / 2;
        };

        const releaseShot = () => {
            // Extend arms forward for shot release
            this.leftArm.rotation.z = 0;
            this.rightArm.rotation.z = 0;
        };

        const resetPosition = () => {
            // Reset arms to default position
            this.leftArm.rotation.z = initialLeftArmRotation;
            this.rightArm.rotation.z = initialRightArmRotation;
            this.playerState.shootingAnimation = false;
        };

        // Execute animation sequence
        prepareShot();
        setTimeout(releaseShot, 100);
        setTimeout(resetPosition, 300);
    }

    checkScore() {
        // Score detection is now handled by physics triggers in setupHoop
        // Just reset the ball state when it's far from the hoop
        if (this.isShot && !this.ballPassedThroughHoop) {
            const ballPos = this.ball.position;
            const rimPos = this.rim.position;
            const distanceFromHoop = Math.sqrt(
                Math.pow(ballPos.x - rimPos.x, 2) +
                Math.pow(ballPos.z - rimPos.z, 2)
            );
            
            // Reset detection state if ball is far from hoop
            if (distanceFromHoop > 2) {
                this.ballAboveRim = false;
                this.ballBelowRim = false;
            }
        }
    }

    isThreePointer() {
        const shotDistance = new THREE.Vector2(
            this.playerState.position.x,
            this.playerState.position.z
        ).length();
        return shotDistance > 6.75;  // NBA three-point line distance
    }

    createScoreEffect() {
        const isThree = this.isThreePointer();
        const particleCount = 100;  // Increased from 50 to 100 particles
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const particleVelocities = [];
        
        // Create particles around the rim position with wider spread
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const radius = Math.random() * 1.2;  // Increased from 0.5 to 1.2 for wider spread
            particlePositions[i * 3] = this.rim.position.x + Math.cos(angle) * radius;
            particlePositions[i * 3 + 1] = this.rim.position.y;
            particlePositions[i * 3 + 2] = this.rim.position.z + Math.sin(angle) * radius;
            
            // Increased velocities for more dramatic movement
            particleVelocities.push({
                x: (Math.random() - 0.5) * 0.4,  // Doubled from 0.2
                y: Math.random() * 0.4,          // Doubled from 0.2
                z: (Math.random() - 0.5) * 0.4   // Doubled from 0.2
            });
        }
        
        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
        
        const particleMaterial = new THREE.PointsMaterial({
            color: isThree ? 0xff0000 : 0xffffff,
            size: 0.12,  // Increased from 0.05 to 0.12
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending  // Added for more dramatic effect
        });
        
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);
        
        // Animate particles with slower fade for longer effect
        const startTime = Date.now();
        const animate = () => {
            const positions = particleGeometry.attributes.position.array;
            const elapsed = (Date.now() - startTime) / 1000;
            
            // Update particle positions
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += particleVelocities[i].x;
                positions[i * 3 + 1] += particleVelocities[i].y;
                positions[i * 3 + 2] += particleVelocities[i].z;
                
                // Reduced gravity for slower falling
                particleVelocities[i].y -= 0.008;  // Reduced from 0.01
            }
            
            particleGeometry.attributes.position.needsUpdate = true;
            particleMaterial.opacity = Math.max(0, 1 - elapsed * 0.7);  // Slower fade out
            
            if (elapsed < 1.5) {  // Increased duration from 1 to 1.5 seconds
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(particles);
            }
        };
        
        animate();
    }

    updatePhysics() {
        this.world.step(1/60);
        
        // Update ball visual position
        this.ball.position.copy(this.ballBody.position);
        this.ball.quaternion.copy(this.ballBody.quaternion);

        // Reset ball only if it's very far out of bounds or below the floor
        const farOutOfBounds = Math.abs(this.ball.position.x) > 25 ||
                             Math.abs(this.ball.position.z) > 25;
        const belowFloor = this.ball.position.y < -2;
        
        if (farOutOfBounds || belowFloor) {
            this.resetBall();
        }
    }

    resetBall() {
        if (!this.player) return; // Safety check

        // Reset ball to player's hands position based on shooting stance
        const handOffset = this.player.rotation.y === Math.PI / 2 ? -0.5 : // Left
                          this.player.rotation.y === -Math.PI / 2 ? 0.5 : // Right
                          this.player.rotation.y === Math.PI ? 0 : // Backward
                          0; // Forward

        const zOffset = this.player.rotation.y === 0 ? -0.5 : // Forward
                       this.player.rotation.y === Math.PI ? 0.5 : // Backward
                       0; // Left/Right
        
        // Position ball at the shooting hand (right hand)
        this.ballBody.position.set(
            this.playerState.position.x + handOffset,
            1.4, // Align with arms
            this.playerState.position.z + zOffset
        );
        this.ballBody.velocity.set(0, 0, 0);
        this.ballBody.angularVelocity.set(0, 0, 0);
        this.isShot = false;
        this.ballPassedThroughHoop = false;
    }

    updatePlayer(deltaTime) {
        // Handle player movement with delta time
        const moveSpeed = 5; // Base movement speed in units per second
        
        if (this.keys.left) {
            this.playerState.position.x -= moveSpeed * deltaTime;
            this.player.rotation.y = Math.PI / 2; // Face left
        }
        if (this.keys.right) {
            this.playerState.position.x += moveSpeed * deltaTime;
            this.player.rotation.y = -Math.PI / 2; // Face right
        }
        if (this.keys.up) {
            this.playerState.position.z -= moveSpeed * deltaTime;
            this.player.rotation.y = 0; // Face forward
        }
        if (this.keys.down) {
            this.playerState.position.z += moveSpeed * deltaTime;
            this.player.rotation.y = Math.PI; // Face backward
        }

        // Handle jumping with proper delta time
        if (this.playerState.isJumping) {
            const gravity = -20; // Gravity acceleration in units per second squared
            this.playerState.velocity.y += gravity * deltaTime;
            this.playerState.position.y += this.playerState.velocity.y * deltaTime;
            
            // Check for ground collision
            if (this.playerState.position.y <= 0) {
                this.playerState.position.y = 0;
                this.playerState.velocity.y = 0;
                this.playerState.isJumping = false;
                this.playerState.onGround = true;
            }
        }

        // Constrain player to gym bounds
        this.playerState.position.x = Math.max(-19.5, Math.min(19.5, this.playerState.position.x));
        this.playerState.position.z = Math.max(-14.5, Math.min(14.5, this.playerState.position.z));

        // Update player mesh position
        this.player.position.copy(this.playerState.position);

        // Check if player can pick up the ball
        if (this.isShot) {
            const playerPos = this.playerState.position;
            const ballPos = this.ball.position;
            const pickupDistance = 1; // Distance within which player can pick up ball
            
            const distance = Math.sqrt(
                Math.pow(playerPos.x - ballPos.x, 2) +
                Math.pow(playerPos.z - ballPos.z, 2)
            );

            // Only allow pickup if ball is near ground and moving slowly
            const ballVelocity = new THREE.Vector3(
                this.ballBody.velocity.x,
                this.ballBody.velocity.y,
                this.ballBody.velocity.z
            );
            const isSlowEnough = ballVelocity.length() < 2; // Ball is moving slowly
            const isNearGround = ballPos.y < 1.5;
            
            if (distance < pickupDistance && isNearGround && isSlowEnough) {
                this.resetBall();
            }
        }

        // Update ball position only if we're holding it (not shot)
        if (!this.isShot && !this.playerState.shootingAnimation) {
            const handOffset = this.player.rotation.y === Math.PI / 2 ? -0.4 : // Left
                             this.player.rotation.y === -Math.PI / 2 ? 0.4 : // Right
                             this.player.rotation.y === Math.PI ? 0 : // Backward
                             0; // Forward

            const zOffset = this.player.rotation.y === 0 ? -0.4 : // Forward
                          this.player.rotation.y === Math.PI ? 0.4 : // Backward
                          0; // Left/Right

            // Position ball at the shooting hand (right hand)
            const ballHeight = this.playerState.isJumping ? 
                             this.playerState.position.y + 1.4 : // Keep relative to player while jumping
                             1.4; // Normal height

            this.ballBody.position.set(
                this.playerState.position.x + handOffset,
                ballHeight,
                this.playerState.position.z + zOffset
            );
            this.ballBody.velocity.set(0, 0, 0);
            this.ballBody.angularVelocity.set(0, 0, 0);
        }

        // Update camera to follow player with smoother movement
        const cameraTargetX = this.playerState.position.x;
        const cameraTargetZ = this.playerState.position.z + 8;
        this.camera.position.x += (cameraTargetX - this.camera.position.x) * 0.1;
        this.camera.position.z += (cameraTargetZ - this.camera.position.z) * 0.1;
        this.camera.lookAt(
            this.playerState.position.x,
            2,
            this.playerState.position.z
        );
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Calculate delta time
        const deltaTime = Math.min(this.clock.getDelta(), 0.1); // Cap at 100ms to prevent huge jumps

        // Update power meter with proper delta time
        if (this.isPoweringUp) {
            this.shotMeterProgress = Math.min(1, this.shotMeterProgress + this.shotMeterSpeed * deltaTime);
            this.shotMeterFill.style.height = `${this.shotMeterProgress * 100}%`;
        }

        // Step physics with proper interpolation
        this.world.step(this.fixedTimeStep, deltaTime, this.maxSubSteps);
        
        this.updatePhysics();
        this.updatePlayer(deltaTime);
        this.checkScore();
        this.renderer.render(this.scene, this.camera);
    }

    setupEventListeners() {
        // Keyboard controls
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false
        };

        window.addEventListener('keydown', (e) => {
            switch(e.key.toLowerCase()) {
                // Arrow keys and WASD
                case 'arrowleft': 
                case 'a':
                    this.keys.left = true; 
                    break;
                case 'arrowright':
                case 'd': 
                    this.keys.right = true; 
                    break;
                case 'arrowup':
                case 'w': 
                    this.keys.up = true; 
                    break;
                case 'arrowdown':
                case 's': 
                    this.keys.down = true; 
                    break;
                case ' ':
                    if (this.playerState.onGround) {
                        this.playerState.isJumping = true;
                        this.playerState.onGround = false;
                        this.playerState.velocity.y = 8; // Initial jump velocity
                    }
                    break;
                case 'e':
                    if (!this.isShot && !this.isPoweringUp) {
                        this.isPoweringUp = true;
                        this.shotMeterProgress = 0;
                        this.shotMeter.style.display = 'block';
                        this.shotMeterFill.style.height = '0%';
                    }
                    break;
                case 'h':
                    if (!this.isShot) {
                        // Debug perfect shot
                        this.shotMeterProgress = (this.perfectReleaseZone.start + this.perfectReleaseZone.end) / 2; // Exactly middle of perfect zone
                        this.shoot();
                    }
                    break;
                case 'r':
                    this.rebound();
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch(e.key.toLowerCase()) {
                case 'arrowleft':
                case 'a': 
                    this.keys.left = false; 
                    break;
                case 'arrowright':
                case 'd': 
                    this.keys.right = false; 
                    break;
                case 'arrowup':
                case 'w': 
                    this.keys.up = false; 
                    break;
                case 'arrowdown':
                case 's': 
                    this.keys.down = false; 
                    break;
                case 'e':
                    if (this.isPoweringUp) {
                        this.isPoweringUp = false;
                        this.shotMeter.style.display = 'none';
                        if (this.shotMeterProgress > 0) {
                            this.shoot();
                        }
                    }
                    break;
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    rebound() {
        if (!this.isShot) return; // Only reset if ball is in play

        // Reset ball to player's hands
        this.resetBall();

        // Add a small visual effect
        this.showReboundEffect();
    }

    showReboundEffect() {
        // Create a circular wave effect at player's position
        const geometry = new THREE.RingGeometry(0, 2, 32);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x44ff44,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        const wave = new THREE.Mesh(geometry, material);
        wave.rotation.x = -Math.PI / 2;
        wave.position.copy(this.playerState.position);
        wave.position.y = 0.1; // Slightly above ground
        this.scene.add(wave);

        // Animate the wave
        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed < 0.5) {
                wave.scale.x = wave.scale.y = 1 + elapsed * 2;
                material.opacity = 0.5 * (1 - elapsed * 2);
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(wave);
            }
        };
        
        animate();
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new BasketballGame();
});