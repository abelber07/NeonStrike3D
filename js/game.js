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
        this.keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
        this.isRunning = false;
        this.matchStarted = false;
        this.peer = null;
        this.conn = null;
        this.connections = new Map();
        this.localPeerId = null;
        this.lastShotByPeer = new Map();
        this.onLobbyChanged = null;
        this.playerName = 'Jugador';
        this.lobbyPlayers = new Map();
        this.combatants = new Map();
        this.isHost = false;
        this.remotePlayers = {};
        this.coverMeshes = [];
        this.worldObjects = [];
        this.mapId = 'neon-district';
        this.animationFrame = null;
        this.velocityY = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.cameraTarget = new THREE.Vector3(0, 1.35, 0);
        this.moveVelocity = new THREE.Vector3();
        this.isGrounded = true;
        this.hp = 100;
        this.canShoot = true;
        this.magazineSize = 10;
        this.ammo = this.magazineSize;
        this.shotCooldown = 280;
        this.isReloading = false;
        this.reloadTimer = null;
        this.respawnTimer = null;
        this.isRespawning = false;
        this.lastFrameTime = performance.now();

        this.initThree();
        this.initInputs();
    }

    createNeonDistrictDetails(theme) {
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0x17243b,
            emissive: 0x07101e,
            emissiveIntensity: 0.35,
            metalness: 0.55,
            roughness: 0.5
        });
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0x8ffaff,
            emissive: theme.grid,
            emissiveIntensity: 1.4
        });
        const buildings = [
            [-42, 6, -38, 10, 12, 8], [42, 8, -35, 12, 16, 10],
            [-45, 5, 38, 14, 10, 10], [42, 5, 38, 10, 10, 14]
        ];
        buildings.forEach(([x, y, z, sx, sy, sz]) => {
            const building = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), buildingMaterial.clone());
            building.position.set(x, y, z);
            building.castShadow = true;
            building.receiveShadow = true;
            this.addWorldObject(building);
            this.coverMeshes.push(building);
            for (let row = 0; row < 3; row++) {
                const windows = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.55, 0.16, 0.08), windowMaterial);
                windows.position.set(x, y - 3 + row * 3, z - sz / 2 - 0.06);
                this.addWorldObject(windows);
            }
        });
        for (let i = 0; i < 10; i++) {
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8),
                new THREE.MeshStandardMaterial({ color: 0x202a3a, metalness: 0.7 })
            );
            pole.position.set((i % 5) * 16 - 32, 2.1, i < 5 ? -30 : 30);
            this.addWorldObject(pole);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), windowMaterial);
            lamp.position.set(pole.position.x, 4.2, pole.position.z);
            this.addWorldObject(lamp);
        }
    }

    notifyLobby() {
        if (!this.onLobbyChanged) return;
        this.onLobbyChanged(Array.from(this.lobbyPlayers.values()));
    }

    getShotData() {
        const origin = new THREE.Vector3();
        this.viewWeapon.userData.muzzle.getWorldPosition(origin);
        const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.raycaster.set(this.camera.position, cameraDirection);
        const aimObjects = [...this.coverMeshes, ...Object.values(this.remotePlayers)];
        const aimHit = this.raycaster.intersectObjects(aimObjects, true)[0];
        const aimPoint = aimHit
            ? aimHit.point
            : this.camera.position.clone().add(cameraDirection.multiplyScalar(100));
        const direction = aimPoint.sub(origin).normalize();
        return { origin, direction };
    }

    reload() {
        if (!this.isRunning || this.isReloading || this.ammo === this.magazineSize) return;
        this.isReloading = true;
        this.canShoot = false;
        this.ui.actualizarHUD(this.hp, 'RECARGANDO');
        this.reloadTimer = setTimeout(() => {
            this.ammo = this.magazineSize;
            this.isReloading = false;
            this.canShoot = true;
            this.reloadTimer = null;
            this.ui.actualizarHUD(this.hp, `${this.ammo}/${this.magazineSize}`);
        }, 1200);
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

        this.createMap(this.mapId);

        // Colisionador local: el modelo queda oculto porque el juego usa primera persona.
        this.player = this.createCharacter(0x00e5ff);
        this.player.position.set(0, 0, 0);
        this.player.visible = false;
        this.player.castShadow = true;
        this.scene.add(this.player);
        this.viewWeapon = this.createFirstPersonWeapon();
        this.camera.add(this.viewWeapon);
        this.scene.add(this.camera);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    createFirstPersonWeapon() {
        const group = new THREE.Group();
        const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x172337, metalness: 0.8, roughness: 0.25 });
        const glowMaterial = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.5 });
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.72), gunMaterial);
        gun.position.set(0.34, -0.26, -0.72);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 10), gunMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.34, -0.24, -1.2);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.16), glowMaterial);
        sight.position.set(0.34, -0.12, -0.82);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x253c5d, roughness: 0.8 }));
        hand.position.set(0.2, -0.34, -0.55);
        group.add(gun, barrel, sight, hand);
        group.userData.muzzle = barrel;
        return group;
    }

    createMap(mapId) {
        this.worldObjects.forEach(object => this.scene.remove(object));
        this.worldObjects = [];
        this.coverMeshes = [];
        const maps = {
            'neon-district': { ground: 0x101a2b, grid: 0x00e5ff, line: 0x1a2a3a, accent: 0xff00aa },
            'orbital-yard': { ground: 0x24222d, grid: 0xffa62b, line: 0x463426, accent: 0xffa62b },
            'reactor-core': { ground: 0x21152b, grid: 0x9d4edd, line: 0x39204e, accent: 0x9d4edd }
        };
        const mapKey = maps[mapId] ? mapId : 'neon-district';
        this.mapId = mapKey;
        const theme = maps[mapKey];
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(200, 200),
            new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 0.85 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.addWorldObject(ground);
        const grid = new THREE.GridHelper(200, 50, theme.grid, theme.line);
        grid.position.y = 0.01;
        this.addWorldObject(grid);

        const layouts = {
            'neon-district': [
                [-28, 3, -18, 8, 6, 4], [-12, 2, 4, 4, 4, 10], [10, 3, -10, 6, 6, 6],
                [28, 2, 15, 10, 4, 4], [0, 4, 24, 4, 8, 4], [-30, 5, 28, 5, 10, 5]
            ],
            'orbital-yard': [
                [-30, 2, -20, 12, 4, 4], [-12, 5, 0, 4, 10, 4], [12, 2, 18, 14, 4, 4],
                [30, 4, -14, 5, 8, 5], [0, 2, -28, 4, 4, 14], [24, 2, 26, 6, 4, 6]
            ],
            'reactor-core': [
                [-24, 4, -18, 5, 8, 5], [0, 2, -20, 14, 4, 4], [25, 5, -8, 5, 10, 5],
                [-18, 2, 15, 8, 4, 4], [12, 3, 18, 6, 6, 6], [0, 2, 30, 16, 4, 4]
            ]
        };
        const material = new THREE.MeshStandardMaterial({
            color: mapKey === 'orbital-yard' ? 0x514238 : mapKey === 'reactor-core' ? 0x422b52 : 0x263b59,
            emissive: theme.accent,
            emissiveIntensity: 0.12,
            roughness: 0.62
        });
        layouts[mapKey].forEach(([x, y, z, sx, sy, sz]) => {
            const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material.clone());
            box.position.set(x, y, z);
            box.castShadow = true;
            box.receiveShadow = true;
            this.addWorldObject(box);
            this.coverMeshes.push(box);
        });
        if (mapKey === 'orbital-yard' || mapKey === 'reactor-core') {
            for (let i = 0; i < 8; i++) {
                const pillar = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.2, 1.2, 7, 12),
                    new THREE.MeshStandardMaterial({ color: 0x303846, emissive: theme.accent, emissiveIntensity: 0.22 })
                );
                pillar.position.set((i % 4) * 18 - 27, 3.5, Math.floor(i / 4) * 30 - 15);
                pillar.castShadow = true;
                this.addWorldObject(pillar);
                this.coverMeshes.push(pillar);
            }
        }
        if (mapKey === 'neon-district') this.createNeonDistrictDetails(theme);
        document.getElementById('hud-map').textContent = mapKey === 'neon-district'
            ? 'DISTRITO NEON'
            : mapKey === 'orbital-yard' ? 'ASTILLERO ORBITAL' : 'NÚCLEO REACTOR';
    }

    addWorldObject(object) {
        this.scene.add(object);
        this.worldObjects.push(object);
    }

    canOccupy(position) {
        const playerSphere = new THREE.Sphere(
            new THREE.Vector3(position.x, 1.1, position.z),
            0.72
        );
        return !this.coverMeshes.some(mesh => {
            const bounds = new THREE.Box3().setFromObject(mesh);
            return bounds.intersectsSphere(playerSphere);
        });
    }

    createCharacter(color) {
        const group = new THREE.Group();
        const armor = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.45 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x101522, metalness: 0.65, roughness: 0.3 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.85, 6, 12), armor);
        body.position.y = 1.15;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), dark);
        head.position.y = 2.05;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.8 }));
        visor.position.set(0, 2.08, -0.32);
        const shoulderMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, metalness: 0.5, roughness: 0.4 });
        const leftShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), shoulderMaterial);
        leftShoulder.position.set(-0.48, 1.42, 0);
        const rightShoulder = leftShoulder.clone();
        rightShoulder.position.x = 0.48;
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0x182033, metalness: 0.5, roughness: 0.45 });
        const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.58, 0.25), legMaterial);
        leftLeg.position.set(-0.2, 0.42, 0);
        const rightLeg = leftLeg.clone();
        rightLeg.position.x = 0.2;
        const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.85), dark);
        weapon.position.set(0.58, 1.25, -0.18);
        weapon.rotation.x = -0.15;
        group.add(body, head, visor, leftShoulder, rightShoulder, leftLeg, rightLeg, weapon);
        group.userData.weapon = weapon;
        group.castShadow = true;
        group.traverse(child => { child.castShadow = true; });
        return group;
    }

    initInputs() {
        document.addEventListener('keydown', (e) => {
            const key = this.getControlKey(e);
            if (key) this.keys[key] = true;
            if (e.code === 'KeyR' && this.isRunning) this.reload();
            if (this.isRunning && key) e.preventDefault();
        });
        document.addEventListener('keyup', (e) => {
            const key = this.getControlKey(e);
            if (key) this.keys[key] = false;
        });
        window.addEventListener('blur', () => this.resetControls());
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement) {
                this.mouseX -= e.movementX * 0.0022;
                this.mouseY -= e.movementY * 0.0022;
                this.mouseY = Math.max(-1.35, Math.min(1.35, this.mouseY));
            }
        });
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.isRunning) this.shoot();
        });
        document.addEventListener('click', (e) => {
            if (this.isRunning && e.target === this.renderer.domElement && !document.pointerLockElement) {
                this.renderer.domElement.requestPointerLock();
            }
        });
    }

    getControlKey(event) {
        const controls = {
            KeyW: 'w',
            KeyA: 'a',
            KeyS: 's',
            KeyD: 'd',
            Space: 'space',
            ShiftLeft: 'shift',
            ShiftRight: 'shift'
        };
        return controls[event.code] || null;
    }

    resetControls() {
        Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
    }

    startMatch(mode, isHost, peerId = null, mapId = this.mapId) {
        this.ui.ocultarTodas();
        this.ui.mostrarHUD(true);
        this.isRunning = true;
        this.matchStarted = true;
        this.isHost = isHost;
        this.mode = mode;
        this.createMap(mapId);
        Object.values(this.remotePlayers).forEach(player => this.scene.remove(player));
        this.remotePlayers = {};
        this.hp = 100;
        this.ammo = this.magazineSize;
        this.isReloading = false;
        this.isRespawning = false;
        this.ui.ocultarRespawn();
        this.player.position.set(0, 0, 0);
        this.viewWeapon.visible = true;

        // Scoreboard inicial
        const initialPlayers = [{ name: this.playerName, kills: 0, tag: '[N00B]' }];
        this.ui.actualizarScoreboard(initialPlayers, mode);
        this.ui.actualizarHUD(100, `${this.ammo}/${this.magazineSize}`);
        this.combatants.clear();
        this.combatants.set(this.localPeerId || 'local', { name: this.playerName, hp: 100, kills: 0, streak: 0 });
        this.lobbyPlayers.set(this.localPeerId || 'local', { id: this.localPeerId || 'local', name: this.playerName, isHost: this.isHost });

        if (isHost) {
            if (!this.peer) this.prepareHost(peerId);
            this.broadcast({ type: 'start', mode, mapId: this.mapId });
        } else if (peerId && !this.conn) {
            this.connectToHost(peerId);
        }

        this.animate();
    }

    prepareHost(roomId, mapId = this.mapId) {
        if (this.peer) return;
        const hostId = roomId || 'ns3d-' + Math.floor(Math.random() * 9000 + 1000);
        this.isHost = true;
        this.mapId = mapId;
        this.peer = new Peer(hostId);
        this.peer.on('open', id => {
            this.localPeerId = id;
            this.lobbyPlayers.delete('local');
            this.lobbyPlayers.set(id, { id, name: this.playerName, isHost: true });
            this.combatants.set(id, { name: this.playerName, hp: 100, kills: 0, streak: 0 });
            document.getElementById('hud-map').textContent = `SALA: ${id}`;
            document.getElementById('play-status').textContent = `Sala lista. Comparte este ID: ${id}`;
            this.broadcastLobby();
            this.notifyLobby();
        });
        this.peer.on('connection', conn => {
            if (this.connections.size >= 5) {
                conn.close();
                return;
            }
            this.connections.set(conn.peer, conn);
            this.conn = conn;
            this.setupConnection(conn);
        });
        this.peer.on('error', error => this.handlePeerError(error));
    }

    connectToHost(peerId) {
        const targetId = peerId.trim();
        this.isHost = false;
        document.getElementById('play-status').textContent = `Conectando con ${targetId}…`;
        this.peer = new Peer();
        this.peer.on('open', id => {
            this.localPeerId = id;
            this.lobbyPlayers.delete('local');
            this.lobbyPlayers.set(id, { id, name: this.playerName, isHost: false });
            this.conn = this.peer.connect(targetId, { reliable: true });
            this.connections.set(targetId, this.conn);
            this.setupConnection(this.conn);
        });
        this.peer.on('disconnected', () => {
            document.getElementById('play-status').textContent = 'Se perdió la conexión con el servidor de salas. Reintentando…';
            this.peer.reconnect();
        });
        this.peer.on('error', error => this.handlePeerError(error));
    }

    setupConnection(conn) {
        const connectionTimeout = setTimeout(() => {
            if (!conn.open) {
                conn.close();
                this.handlePeerError({ type: 'connection-timeout' });
            }
        }, 15000);
        conn.on('open', () => {
            clearTimeout(connectionTimeout);
            console.log('Conexión P2P establecida');
            document.getElementById('play-status').textContent = 'Conectado a la sala.';
            conn.send({ type: 'hello', id: this.localPeerId, name: this.playerName, isHost: this.isHost, mapId: this.mapId });
        });
        conn.on('error', error => {
            clearTimeout(connectionTimeout);
            this.handlePeerError(error);
        });

        conn.on('data', (data) => {
            if (data.type === 'move') {
                this.handleRemoteMove(conn, data);
            }
            if (data.type === 'shoot') {
                if (this.isHost) this.handleRemoteShoot(conn, data);
            }
            if (data.type === 'hit' && !this.isHost && conn.peer) {
                this.recibirDaño(25);
            }
            if (data.type === 'start' && !this.isRunning) {
                this.startMatch(data.mode || 'ffa', false, null, data.mapId || this.mapId);
            }
            if (data.type === 'kill') {
                this.ui.addKillEvent(data.killer, data.victim, data.streak);
                const killer = this.combatants.get(data.killerId) || { name: data.killer, kills: 0, streak: 0, hp: 100 };
                killer.kills += 1;
                killer.streak = data.streak;
                this.combatants.set(data.killerId, killer);
                const victim = this.combatants.get(data.victimId);
                if (victim) victim.streak = 0;
                this.ui.actualizarScoreboard(
                    Array.from(this.combatants.values()).map(player => ({ name: player.name, kills: player.kills })),
                    this.mode
                );
            }
            if (data.type === 'player-joined') {
                this.ui.addKillfeed(`${data.name} se ha unido a la partida`);
            }
            if (data.type === 'lobby') {
                this.lobbyPlayers = new Map(data.players.map(player => [player.id, player]));
                if (data.mapId) this.mapId = data.mapId;
                if (data.mode) this.mode = data.mode;
                data.players.forEach(player => {
                    if (!this.combatants.has(player.id)) {
                        this.combatants.set(player.id, { name: player.name, hp: 100, kills: 0, streak: 0 });
                    }
                });
                this.notifyLobby();
            }
            if (data.type === 'hello') {
                const id = data.id || conn.peer;
                this.createRemotePlayer(id);
                if (this.isHost) {
                    this.lobbyPlayers.set(id, { id, name: data.name || `Jugador ${id.slice(-4)}`, isHost: false });
                    this.combatants.set(id, { name: data.name || `Jugador ${id.slice(-4)}`, hp: 100, kills: 0, streak: 0 });
                    this.ui.addKillfeed(`${data.name || 'Jugador'} se ha unido a la partida`);
                    const joinEvent = { type: 'player-joined', name: data.name || `Jugador ${id.slice(-4)}` };
                    this.broadcast(joinEvent, conn.peer);
                    conn.send(joinEvent);
                    this.remotePlayers && Object.keys(this.remotePlayers)
                        .filter(playerId => playerId !== id)
                        .forEach(playerId => conn.send({ type: 'player', id: playerId }));
                    this.broadcast({ type: 'player', id }, conn.peer);
                    this.broadcastLobby();
                    this.notifyLobby();
                    if (this.matchStarted) {
                        conn.send({ type: 'start', mode: this.mode, mapId: this.mapId });
                    }
                }
                if (!this.isHost && data.mapId) this.createMap(data.mapId);
            }
            if (data.type === 'player') {
                this.createRemotePlayer(data.id);
            }
        });

        conn.on('close', () => {
            clearTimeout(connectionTimeout);
            this.connections.delete(conn.peer);
            this.removeRemotePlayer(conn.peer);
            this.lobbyPlayers.delete(conn.peer);
            this.combatants.delete(conn.peer);
            this.notifyLobby();
            console.log('Conexión cerrada');
            if (!this.isHost && this.isRunning) this.handlePeerError({ type: 'disconnected' });
        });
    }

    handlePeerError(error) {
        console.error('Peer error:', error);
        const status = document.getElementById('play-status');
        const messages = {
            'unavailable-id': 'Ese código de sala ya está ocupado. Usa otro.',
            'peer-unavailable': 'No existe una sala activa con ese ID. Comprueba el código del host.',
            'connection-timeout': 'No se recibió respuesta del host. Comprueba el ID y que el host mantenga abierta la sala.',
            'network': 'No se pudo conectar con el servidor de salas. Comprueba la conexión a Internet.',
            'server-error': 'El servidor de salas rechazó la conexión. Inténtalo de nuevo.',
            'socket-error': 'No se pudo abrir la conexión de red para la sala.',
            'disconnected': 'La conexión con el host se ha cerrado.'
        };
        status.textContent = messages[error.type] || `No se pudo conectar con la sala (${error.type || 'error desconocido'}).`;
        if (!this.isRunning) {
            if (this.peer) this.peer.destroy();
            this.peer = null;
            this.connections.clear();
            return;
        }
        this.stop();
        this.ui.mostrarHUD(false);
        this.ui.showScreen('screen-play');
    }

    broadcast(message, exceptPeer = null) {
        this.connections.forEach((connection, peerId) => {
            if (peerId !== exceptPeer && connection.open) connection.send(message);
        });
    }

    broadcastLobby() {
        const players = Array.from(this.lobbyPlayers.entries()).map(([id, player]) => ({ id, ...player }));
        this.broadcast({ type: 'lobby', players, mapId: this.mapId, mode: this.mode || 'ffa' });
    }

    handleRemoteMove(conn, data) {
        const id = this.isHost ? conn.peer : data.id;
        if (!id || id === this.localPeerId) return;
        const values = [data.x, data.y, data.z];
        if (!values.every(Number.isFinite) || values.some(value => Math.abs(value) > 100)) return;
        this.updateRemotePlayer(id, data.x, data.y, data.z);
        if (Number.isFinite(data.yaw) && this.remotePlayers[id]) {
            this.remotePlayers[id].userData.targetYaw = data.yaw;
        }
        if (this.isHost) this.broadcast({ type: 'move', id, x: data.x, y: data.y, z: data.z, yaw: data.yaw }, id);
    }

    createRemotePlayer(id) {
        if (this.remotePlayers[id]) return;
        const mesh = this.createCharacter(0xff4d4d);
        mesh.position.set(5, 0, 5);
        this.scene.add(mesh);
        this.remotePlayers[id] = mesh;
    }

    updateRemotePlayer(id, x, y, z) {
        if (!this.remotePlayers[id]) this.createRemotePlayer(id);
        const target = this.remotePlayers[id];
        target.position.lerp(new THREE.Vector3(x, y, z), 0.2);
        if (Number.isFinite(target.userData.targetYaw)) {
            const angleDelta = Math.atan2(
                Math.sin(target.userData.targetYaw - target.rotation.y),
                Math.cos(target.userData.targetYaw - target.rotation.y)
            );
            target.rotation.y += angleDelta * 0.25;
        }
    }

    removeRemotePlayer(id) {
        const player = this.remotePlayers[id];
        if (!player) return;
        this.scene.remove(player);
        delete this.remotePlayers[id];
    }

    shoot() {
        if (!this.isRunning || !this.canShoot || this.isReloading || this.isRespawning) return;
        if (this.ammo <= 0) {
            this.reload();
            return;
        }
        this.canShoot = false;
        setTimeout(() => { this.canShoot = true; }, this.shotCooldown);
        this.ammo -= 1;
        this.ui.actualizarHUD(this.hp, `${this.ammo}/${this.magazineSize}`);
        if (this.ammo === 0) this.reload();

        const shot = this.getShotData();
        if (!shot) return;
        const { origin, direction } = shot;

        this.raycaster.set(origin, direction);
        const intersects = this.raycaster.intersectObjects(this.coverMeshes, true);

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
        const message = {
                type: 'shoot',
                origin: { x: origin.x, y: origin.y, z: origin.z },
                direction: { x: direction.x, y: direction.y, z: direction.z }
        };
        if (this.isHost) {
            this.handleRemoteShoot({ peer: this.localPeerId }, message);
            this.broadcast(message);
        } else if (this.conn && this.conn.open) {
            this.conn.send(message);
        }
    }

    handleRemoteShoot(connection, data) {
        if (!data.origin || !data.direction || this.isRespawning) return;
        const shooterId = connection.peer;
        const now = Date.now();
        if (now - (this.lastShotByPeer.get(shooterId) || 0) < 250) return;
        this.lastShotByPeer.set(shooterId, now);
        const origin = new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z);
        const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
        if (![...origin, ...direction].every(Number.isFinite) || direction.lengthSq() < 0.9) return;
        direction.normalize();
        const shooter = shooterId === this.localPeerId ? this.player : this.remotePlayers[shooterId];
        if (!shooter || origin.distanceTo(shooter.position) > 8) return;
        this.raycaster.set(origin, direction);
        const targets = (shooterId === this.localPeerId ? [] : [this.player]).concat(Object.entries(this.remotePlayers)
            .filter(([id]) => id !== shooterId)
            .map(([, player]) => player));
        const targetHits = this.raycaster.intersectObjects(targets, true);
        const coverHits = this.raycaster.intersectObjects(this.coverMeshes, false);
        const targetHit = targetHits[0];
        const coverHit = coverHits[0];
        if (!targetHit || (coverHit && coverHit.distance < targetHit.distance) || targetHit.distance > 100) return;
        const targetRoot = targetHit.object.parent;
        const targetId = targetHit.object === this.player || targetRoot === this.player
            ? this.localPeerId
            : Object.keys(this.remotePlayers).find(id => this.remotePlayers[id] === targetHit.object || this.remotePlayers[id] === targetRoot);
        if (!targetId) return;
        const victim = this.combatants.get(targetId) || { name: this.lobbyPlayers.get(targetId)?.name || `Jugador ${targetId.slice(-4)}`, hp: 100, kills: 0, streak: 0 };
        const attacker = this.combatants.get(shooterId) || { name: this.lobbyPlayers.get(shooterId)?.name || 'Jugador', hp: 100, kills: 0, streak: 0 };
        victim.hp -= 25;
        this.combatants.set(targetId, victim);
        if (targetId === this.localPeerId) {
            this.recibirDaño(25);
        } else {
            const targetConnection = this.connections.get(targetId);
            if (targetConnection && targetConnection.open) targetConnection.send({ type: 'hit', damage: 25 });
        }
        if (victim.hp <= 0) {
            attacker.kills += 1;
            attacker.streak += 1;
            victim.streak = 0;
            victim.hp = 100;
            this.combatants.set(shooterId, attacker);
            this.combatants.set(targetId, victim);
            const kill = {
                type: 'kill',
                killerId: shooterId,
                victimId: targetId,
                killer: attacker.name,
                victim: victim.name,
                streak: attacker.streak
            };
            this.ui.addKillEvent(kill.killer, kill.victim, kill.streak);
            this.ui.actualizarScoreboard(
                Array.from(this.combatants.values()).map(player => ({ name: player.name, kills: player.kills })),
                this.mode
            );
            this.broadcast(kill);
        }
    }

    recibirDaño(dmg) {
        if (this.isRespawning || !Number.isFinite(dmg) || dmg <= 0) return;
        this.hp -= dmg;
        this.ui.actualizarHUD(this.hp, `${this.ammo}/${this.magazineSize}`);
        if (this.hp <= 0) {
            this.respawn();
        }
    }

    respawn() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.hp = 100;
        this.ui.actualizarHUD(100, `${this.ammo}/${this.magazineSize}`);
        this.ui.mostrarRespawn(3);
        let counter = 3;
        this.respawnTimer = setInterval(() => {
            counter--;
            if (counter <= 0) {
                clearInterval(this.respawnTimer);
                this.respawnTimer = null;
                this.isRespawning = false;
                this.ui.ocultarRespawn();
                this.player.position.set(
                    (Math.random() - 0.5) * 40,
                    0,
                    (Math.random() - 0.5) * 40
                );
            } else {
                this.ui.mostrarRespawn(counter);
            }
        }, 1000);
    }

    animate() {
        if (!this.isRunning) return;
        this.animationFrame = requestAnimationFrame(() => this.animate());
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.mouseX;
        this.camera.rotation.x = this.mouseY;
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
        const wish = new THREE.Vector3();
        if (this.keys.w) wish.add(forward);
        if (this.keys.s) wish.sub(forward);
        if (this.keys.d) wish.add(right);
        if (this.keys.a) wish.sub(right);
        if (wish.lengthSq() > 0) wish.normalize();
        this.player.rotation.y = this.mouseX;
        const maxSpeed = this.keys.shift ? 8.5 : 5.2;
        const acceleration = wish.lengthSq() > 0 ? 24 : 18;
        const targetX = wish.x * maxSpeed;
        const targetZ = wish.z * maxSpeed;
        this.moveVelocity.x = THREE.MathUtils.damp(this.moveVelocity.x, targetX, acceleration, dt);
        this.moveVelocity.z = THREE.MathUtils.damp(this.moveVelocity.z, targetZ, acceleration, dt);
        const nextX = this.player.position.clone();
        nextX.x += this.moveVelocity.x * dt;
        if (this.canOccupy(nextX)) this.player.position.x = nextX.x;
        const nextZ = this.player.position.clone();
        nextZ.z += this.moveVelocity.z * dt;
        if (this.canOccupy(nextZ)) this.player.position.z = nextZ.z;

        // Salto + gravedad
        if (this.keys.space && this.player.position.y <= 0.001) {
            this.velocityY = 7;
        }
        this.velocityY -= 20 * dt;
        this.player.position.y += this.velocityY * dt;
        if (this.player.position.y < 0) {
            this.player.position.y = 0;
            this.velocityY = 0;
        }

        // Limitar al mapa
        this.player.position.x = Math.max(-90, Math.min(90, this.player.position.x));
        this.player.position.z = Math.max(-90, Math.min(90, this.player.position.z));

        this.camera.position.set(this.player.position.x, this.player.position.y + 1.62, this.player.position.z);
        const bob = wish.lengthSq() > 0 && this.player.position.y <= 0.001 ? Math.sin(now * 0.012) * 0.008 : 0;
        this.viewWeapon.position.y = bob;

        // Sincronizar posición
        const movement = {
                type: 'move',
                id: this.localPeerId,
                x: this.player.position.x,
                y: this.player.position.y,
                z: this.player.position.z,
                yaw: this.mouseX
        };
        if (this.isHost) this.broadcast(movement);
        else if (this.conn && this.conn.open) this.conn.send(movement);

        this.renderer.render(this.scene, this.camera);
    }

    stop() {
        this.isRunning = false;
        this.matchStarted = false;
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
        if (this.respawnTimer) {
            clearInterval(this.respawnTimer);
            this.respawnTimer = null;
        }
        this.isRespawning = false;
        if (this.viewWeapon) this.viewWeapon.visible = false;
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = null;
        }
        this.isReloading = false;
        this.canShoot = true;
        if (this.peer) this.peer.destroy();
        this.peer = null;
        this.conn = null;
        this.connections.clear();
        this.lastShotByPeer.clear();
        if (document.pointerLockElement) document.exitPointerLock();
    }
}