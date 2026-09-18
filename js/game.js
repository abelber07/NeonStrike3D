// js/game.js
import * as THREE from 'three';

export class GameEngine {
    constructor(uiManager) {
        this.ui = uiManager;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.player = null;
        this.playerBody = null;
        this.raycaster = new THREE.Raycaster();
        this.keys = { w: false, a: false, s: false, d: false, space: false };
        this.isRunning = false;
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.remotePlayers = {};
        this.velocityY = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.hp = 100;
        this.canShoot = true;

        this.initThree();
        this.initInputs();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0e14);
        this.scene.fog = new THREE.Fog(0x0b0e14, 15, 80);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 6, 10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('viewport').appendChild(this.renderer.domElement);

        // Luces
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const dir = new THREE.DirectionalLight(0xffffff, 1);
        dir.position.set(20, 30, 20);
        dir.castShadow = true;
        dir.shadow.mapSize.width = 1024;
        dir.shadow.mapSize.height = 1024;
        this.scene.add(dir);

        // Luces de neón
        const neon1 = new THREE.PointLight(0x00e5ff, 2, 30);
        neon1.position.set(15, 8, 15);
        this.scene.add(neon1);

        const neon2 = new THREE.PointLight(0xff00aa, 2, 30);
        neon2.position.set(-15, 8, -15);
        this.scene.add(neon2);

        // Suelo
        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2333, roughness: 0.9 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid de neón
        const grid = new THREE.GridHelper(200, 50, 0x00e5ff, 0x1a2a3a);
        grid.position.y = 0.01;
        this.scene.add(grid);

        // Cajas de cobertura (mapa Cyberpunk)
        for (let i = 0; i < 40; i++) {
            const size = Math.random() * 3 + 1;
            const boxGeo = new THREE.BoxGeometry(size, size * 2, size);
            const boxMat = new THREE.MeshStandardMaterial({
                color: 0x2a3a5a,
                emissive: 0x00e5ff,
                emissiveIntensity: 0.15,
                roughness: 0.6
            });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set(
                (Math.random() - 0.5) * 80,
                size,
                (Math.random() - 0.5) * 80
            );
            box.castShadow = true;
            box.receiveShadow = true;
            this.scene.add(box);
        }

        // Jugador local
        const playerGeo = new THREE.CapsuleGeometry(0.5, 1.2, 4, 8);
        const playerMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.3 });
        this.player = new THREE.Mesh(playerGeo, playerMat);
        this.player.position.set(0, 1.5, 0);
        this.player.castShadow = true;
        this.scene.add(this.player);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initInputs() {
        document.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            if (k in this.keys) this.keys[k] = true;
            if (e.code === 'Space') this.keys.space = true;
        });
        document.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (k in this.keys) this.keys[k] = false;
            if (e.code === 'Space') this.keys.space = false;
        });
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement) {
                this.mouseX -= e.movementX * 0.002;
                this.mouseY -= e.movementY * 0.002;
                this.mouseY = Math.max(-0.6, Math.min(0.6, this.mouseY));
            }
        });
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.isRunning) this.shoot();
        });
        document.addEventListener('click', () => {
            if (this.isRunning && !document.pointerLockElement) {
                this.renderer.domElement.requestPointerLock();
            }
        });
    }

    startMatch(mode, isHost, peerId = null) {
        this.ui.ocultarTodas();
        this.ui.mostrarHUD(true);
        this.isRunning = true;
        this.isHost = isHost;
        this.hp = 100;
        this.player.position.set(0, 1.5, 0);

        // Scoreboard inicial
        const initialPlayers = [{ name: 'Tú', kills: 0, tag: '[N00B]' }];
        this.ui.actualizarScoreboard(initialPlayers, mode);
        this.ui.actualizarHUD(100, '∞');

        // PeerJS
        if (isHost) {
            const roomId = 'ns3d-' + Math.floor(Math.random() * 9000 + 1000);
            this.peer = new Peer(roomId);
            this.peer.on('open', (id) => {
                document.getElementById('hud-map').textContent = `SALA: ${id}`;
                console.log('Sala creada:', id);
            });
            this.peer.on('connection', (conn) => {
                this.conn = conn;
                this.setupConnection();
            });
            this.peer.on('error', (err) => console.error('Peer error:', err));
        } else if (peerId) {
            this.peer = new Peer();
            this.peer.on('open', () => {
                this.conn = this.peer.connect(peerId);
                this.setupConnection();
            });
            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                alert('No se pudo conectar a la sala. Verifica el ID.');
            });
        }

        this.animate();
    }

    setupConnection() {
        this.conn.on('open', () => {
            console.log('Conexión P2P establecida');
            this.conn.send({ type: 'hello', isHost: this.isHost });
        });

        this.conn.on('data', (data) => {
            if (data.type === 'move') {
                this.updateRemotePlayer(data.id, data.x, data.y, data.z);
            }
            if (data.type === 'shoot') {
                this.handleRemoteShoot(data);
            }
            if (data.type === 'hello') {
                this.createRemotePlayer(data.id || 'remote');
            }
            if (data.type === 'hit') {
                this.recibirDaño(data.damage);
            }
        });

        this.conn.on('close', () => {
            console.log('Conexión cerrada');
        });
    }

    createRemotePlayer(id) {
        if (this.remotePlayers[id]) return;
        const geo = new THREE.CapsuleGeometry(0.5, 1.2, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff4d4d, emissiveIntensity: 0.3 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(5, 1.5, 5);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.remotePlayers[id] = mesh;
    }

    updateRemotePlayer(id, x, y, z) {
        if (!this.remotePlayers[id]) this.createRemotePlayer(id);
        const target = this.remotePlayers[id];
        target.position.lerp(new THREE.Vector3(x, y, z), 0.2);
    }

    shoot() {
        if (!this.isRunning || !this.canShoot) return;
        this.canShoot = false;
        setTimeout(() => this.canShoot = true, 300);

        // Dirección basada en la cámara
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        this.raycaster.set(this.camera.position, direction);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // Efecto visual: pequeña esfera en el punto de impacto
        if (intersects.length > 0) {
            const hit = intersects[0];
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(0.1),
                new THREE.MeshBasicMaterial({ color: 0xffff00 })
            );
            marker.position.copy(hit.point);
            this.scene.add(marker);
            setTimeout(() => this.scene.remove(marker), 500);
        }

        // Enviar disparo al otro jugador
        if (this.conn && this.conn.open) {
            this.conn.send({
                type: 'shoot',
                origin: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z }
            });
        }
    }

    handleRemoteShoot(data) {
        console.log('Enemigo disparó desde:', data.origin);
    }

    recibirDaño(dmg) {
        this.hp -= dmg;
        this.ui.actualizarHUD(this.hp, '∞');
        if (this.hp <= 0) {
            this.respawn();
        }
    }

    respawn() {
        this.hp = 100;
        this.ui.actualizarHUD(100, '∞');
        this.ui.mostrarRespawn(3);
        let counter = 3;
        const interval = setInterval(() => {
            counter--;
            if (counter <= 0) {
                clearInterval(interval);
                this.ui.ocultarRespawn();
                this.player.position.set(
                    (Math.random() - 0.5) * 40,
                    1.5,
                    (Math.random() - 0.5) * 40
                );
            } else {
                this.ui.mostrarRespawn(counter);
            }
        }, 1000);
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());

        // Movimiento
        const speed = 0.25;
        if (this.keys.w) this.player.position.z -= speed;
        if (this.keys.s) this.player.position.z += speed;
        if (this.keys.a) this.player.position.x -= speed;
        if (this.keys.d) this.player.position.x += speed;

        // Salto + gravedad
        if (this.keys.space && this.player.position.y <= 1.5) {
            this.velocityY = 0.4;
        }
        this.velocityY -= 0.02;
        this.player.position.y += this.velocityY;
        if (this.player.position.y < 1.5) {
            this.player.position.y = 1.5;
            this.velocityY = 0;
        }

        // Limitar al mapa
        this.player.position.x = Math.max(-90, Math.min(90, this.player.position.x));
        this.player.position.z = Math.max(-90, Math.min(90, this.player.position.z));

        // Cámara tercera persona
        const camOffset = new THREE.Vector3(0, 4, 8);
        camOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.mouseY);
        const targetPos = this.player.position.clone().add(camOffset);
        this.camera.position.lerp(targetPos, 0.15);
        this.camera.lookAt(this.player.position.x, this.player.position.y + 1, this.player.position.z);

        // Sincronizar posición
        if (this.conn && this.conn.open) {
            this.conn.send({
                type: 'move',
                id: 'remote',
                x: this.player.position.x,
                y: this.player.position.y,
                z: this.player.position.z
            });
        }

        this.renderer.render(this.scene, this.camera);
    }

    stop() {
        this.isRunning = false;
        if (this.peer) this.peer.destroy();
        if (this.renderer) {
            this.renderer.domElement.remove();
        }
        if (document.pointerLockElement) document.exitPointerLock();
    }
}