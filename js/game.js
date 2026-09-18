import * as THREE from 'three';

const SCENARIOS = {
    'neon-district': {
        label: 'Distrito Neon',
        ground: 0x101a2b,
        grid: 0x00e5ff,
        line: 0x1a2a3a,
        accent: 0xff00aa,
        cover: [
            [-28, 3, -18, 8, 6, 4], [-12, 2, 4, 4, 4, 10], [10, 3, -10, 6, 6, 6],
            [28, 2, 15, 10, 4, 4], [0, 4, 24, 4, 8, 4], [-30, 5, 28, 5, 10, 5]
        ]
    },
    'orbital-yard': {
        label: 'Astillero Orbital',
        ground: 0x24222d,
        grid: 0xffa62b,
        line: 0x463426,
        accent: 0xffa62b,
        cover: [
            [-30, 2, -20, 12, 4, 4], [-12, 5, 0, 4, 10, 4], [12, 2, 18, 14, 4, 4],
            [30, 4, -14, 5, 8, 5], [0, 2, -28, 4, 4, 14], [24, 2, 26, 6, 4, 6]
        ]
    },
    'reactor-core': {
        label: 'Núcleo Reactor',
        ground: 0x21152b,
        grid: 0x9d4edd,
        line: 0x39204e,
        accent: 0x9d4edd,
        cover: [
            [-24, 4, -18, 5, 8, 5], [0, 2, -20, 14, 4, 4], [25, 5, -8, 5, 10, 5],
            [-18, 2, 15, 8, 4, 4], [12, 3, 18, 6, 6, 6], [0, 2, 30, 16, 4, 4]
        ]
    }
};

export class GameEngine {
    constructor(uiManager) {
        this.ui = uiManager;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.player = null;
        this.viewWeapon = null;
        this.coverMeshes = [];
        this.worldObjects = [];
        this.bots = new Map();
        this.tracers = [];
        this.effects = [];
        this.raycaster = new THREE.Raycaster();
        this.keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
        this.moveVelocity = new THREE.Vector3();
        this.velocityY = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.lastFrameTime = performance.now();
        this.animationFrame = null;
        this.isRunning = false;
        this.isRespawning = false;
        this.training = false;
        this.trainingRound = 0;
        this.trainingKills = 0;
        this.trainingElapsed = 0;
        this.trainingLives = 3;
        this.storyChapter = 0;
        this.onProgress = null;
        this.trainingNextRoundTimer = null;
        this.playerName = 'Jugador';
        this.mapId = 'neon-district';
        this.hp = 100;
        this.magazineSize = 10;
        this.ammo = this.magazineSize;
        this.canShoot = true;
        this.isReloading = false;
        this.reloadTimer = null;
        this.respawnTimer = null;
        this.initThree();
        this.initInputs();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x070b13);
        this.scene.fog = new THREE.Fog(0x070b13, 20, 92);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('viewport').appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0xb9e9ff, 0x111426, 1.3));
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(18, 32, 14);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        this.scene.add(sun);
        this.createMap(this.mapId);

        this.player = this.createCharacter(0x00e5ff);
        this.player.visible = false;
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

    addWorldObject(object) {
        this.scene.add(object);
        this.worldObjects.push(object);
    }

    createMap(mapId) {
        this.worldObjects.forEach(object => this.scene.remove(object));
        this.worldObjects = [];
        this.coverMeshes = [];
        const key = SCENARIOS[mapId] ? mapId : 'neon-district';
        const scenario = SCENARIOS[key];
        this.mapId = key;
        this.scene.background.set(scenario.ground);
        this.scene.fog.color.set(scenario.ground);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(200, 200),
            new THREE.MeshStandardMaterial({ color: scenario.ground, roughness: 0.82, metalness: 0.12 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.addWorldObject(ground);
        const grid = new THREE.GridHelper(200, 50, scenario.grid, scenario.line);
        grid.position.y = 0.02;
        this.addWorldObject(grid);

        const coverMaterial = new THREE.MeshStandardMaterial({
            color: scenario.accent, emissive: scenario.accent, emissiveIntensity: 0.08,
            metalness: 0.48, roughness: 0.55
        });
        scenario.cover.forEach(([x, y, z, sx, sy, sz], index) => {
            const cover = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), coverMaterial.clone());
            cover.position.set(x, y, z);
            cover.castShadow = true;
            cover.receiveShadow = true;
            cover.userData.occluder = true;
            this.addWorldObject(cover);
            this.coverMeshes.push(cover);
            this.addScenarioTrim(cover, scenario, index);
        });
        if (key !== 'neon-district') {
            for (let i = 0; i < 8; i++) {
                const pillar = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.1, 1.1, 7, 16),
                    new THREE.MeshStandardMaterial({ color: 0x303846, emissive: scenario.accent, emissiveIntensity: 0.2 })
                );
                pillar.position.set((i % 4) * 18 - 27, 3.5, Math.floor(i / 4) * 30 - 15);
                pillar.castShadow = true;
                this.addWorldObject(pillar);
                this.coverMeshes.push(pillar);
            }
        }
        this.addScenarioDetails(scenario, key);
    }

    addScenarioDetails(scenario, key) {
        const glow = new THREE.MeshBasicMaterial({ color: scenario.grid });
        for (let i = 0; i < 12; i++) {
            const x = (i % 6) * 18 - 45;
            const z = Math.floor(i / 6) * 34 - 17;
            const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5.5, 8), glow);
            beacon.position.set(x, 2.75, z);
            this.addWorldObject(beacon);
        }
        if (key === 'neon-district') {
            for (let i = 0; i < 5; i++) {
                const tower = new THREE.Mesh(
                    new THREE.BoxGeometry(4 + (i % 2), 11 + (i % 3) * 2, 4),
                    new THREE.MeshStandardMaterial({ color: 0x17253f, emissive: scenario.accent, emissiveIntensity: 0.18, metalness: 0.65 })
                );
                tower.position.set(-42 + i * 20, tower.geometry.parameters.height / 2, -42);
                tower.castShadow = true;
                this.addWorldObject(tower);
                this.coverMeshes.push(tower);
            }
        } else {
            const ringMaterial = new THREE.MeshBasicMaterial({ color: scenario.grid, transparent: true, opacity: 0.65 });
            for (let i = 0; i < 4; i++) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(4 + i, 0.08, 8, 32), ringMaterial);
                ring.rotation.x = Math.PI / 2;
                ring.position.set((i - 1.5) * 14, 0.08, 26);
                this.addWorldObject(ring);
            }
        }
    }

    addScenarioTrim(cover, scenario, index) {
        const trim = new THREE.Mesh(
            new THREE.BoxGeometry(cover.scale.x || 1, 0.06, 0.06),
            new THREE.MeshBasicMaterial({ color: scenario.grid })
        );
        trim.scale.set(cover.geometry.parameters.width, 1, 1);
        trim.position.set(cover.position.x, cover.position.y + cover.geometry.parameters.height / 2 + 0.04, cover.position.z - cover.geometry.parameters.depth / 2 - 0.03);
        this.addWorldObject(trim);
        if (index % 2 === 0) {
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: scenario.grid }));
            beacon.position.set(cover.position.x, cover.position.y + cover.geometry.parameters.height / 2 + 0.25, cover.position.z);
            this.addWorldObject(beacon);
        }
    }

    createFirstPersonWeapon() {
        const group = new THREE.Group();
        const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x172337, metalness: 0.85, roughness: 0.25 });
        const glowMaterial = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.7 });
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.72), gunMaterial);
        gun.position.set(0.34, -0.26, -0.72);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 10), gunMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.34, -0.24, -1.2);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.16), glowMaterial);
        sight.position.set(0.34, -0.12, -0.82);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x253c5d }));
        hand.position.set(0.2, -0.34, -0.55);
        const flash = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a3, transparent: true, opacity: 0 }));
        flash.rotation.x = -Math.PI / 2;
        flash.position.set(0.34, -0.24, -1.37);
        group.add(gun, barrel, sight, hand, flash);
        group.userData.muzzle = barrel;
        group.userData.flash = flash;
        return group;
    }

    createCharacter(color, archetype = 'soldier') {
        const group = new THREE.Group();
        const armor = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.28, metalness: 0.42, roughness: 0.42 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x101522, metalness: 0.65, roughness: 0.3 });
        const body = archetype === 'drone'
            ? new THREE.Mesh(new THREE.OctahedronGeometry(0.82, 1), armor)
            : archetype === 'sentinel'
                ? new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.8, 1.25, 8), armor)
                : new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.85, 6, 12), armor);
        body.position.y = 1.15;
        const head = archetype === 'drone'
            ? new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), dark)
            : new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), dark);
        head.position.y = 2.05;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.8 }));
        visor.position.set(0, 2.08, -0.32);
        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), armor);
        shoulder.position.set(-0.48, 1.42, 0);
        const otherShoulder = shoulder.clone();
        otherShoulder.position.x = 0.48;
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0x182033, metalness: 0.5, roughness: 0.45 });
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.58, 0.25), legMaterial);
        leg.position.set(-0.2, 0.42, 0);
        const otherLeg = leg.clone();
        otherLeg.position.x = 0.2;
        const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.85), dark);
        weapon.position.set(0.58, 1.25, -0.18);
        group.add(body, head, visor, shoulder, otherShoulder, leg, otherLeg, weapon);
        if (archetype === 'drone') {
            const eye = new THREE.Mesh(
                new THREE.SphereGeometry(0.14, 12, 8),
                new THREE.MeshBasicMaterial({ color: 0xfff2a3 })
            );
            eye.position.set(0, 1.16, -0.72);
            const antenna = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.035, 0.65, 8),
                new THREE.MeshBasicMaterial({ color: color })
            );
            antenna.position.set(0, 2.82, 0);
            group.add(eye, antenna);
        } else if (archetype === 'sentinel') {
            const core = new THREE.Mesh(
                new THREE.TorusGeometry(0.22, 0.06, 8, 18),
                new THREE.MeshBasicMaterial({ color: 0xfff2a3 })
            );
            core.position.set(0, 1.25, -0.68);
            core.rotation.x = Math.PI / 2;
            group.add(core);
        }
        group.userData.legs = [leg, otherLeg];
        group.userData.archetype = archetype;
        group.traverse(child => { child.castShadow = true; });
        return group;
    }

    initInputs() {
        document.addEventListener('keydown', event => {
            const key = this.getControlKey(event);
            if (key) this.keys[key] = true;
            if (event.code === 'KeyR' && this.isRunning) this.reload();
            if (this.isRunning && key) event.preventDefault();
        });
        document.addEventListener('keyup', event => {
            const key = this.getControlKey(event);
            if (key) this.keys[key] = false;
        });
        window.addEventListener('blur', () => this.resetControls());
        document.addEventListener('mousemove', event => {
            if (!document.pointerLockElement) return;
            this.mouseX -= event.movementX * 0.0022;
            this.mouseY = THREE.MathUtils.clamp(this.mouseY - event.movementY * 0.0022, -1.35, 1.35);
        });
        document.addEventListener('mousedown', event => {
            if (event.button === 0 && this.isRunning) this.shoot();
        });
        document.addEventListener('click', event => {
            if (this.isRunning && event.target === this.renderer.domElement && !document.pointerLockElement) {
                this.renderer.domElement.requestPointerLock();
            }
        });
    }

    getControlKey(event) {
        return ({ KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: 'space', ShiftLeft: 'shift', ShiftRight: 'shift' })[event.code] || null;
    }

    resetControls() {
        Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
    }

    canOccupy(position) {
        const sphere = new THREE.Sphere(new THREE.Vector3(position.x, position.y + 1.05, position.z), 0.72);
        return !this.coverMeshes.some(mesh => new THREE.Box3().setFromObject(mesh).intersectsSphere(sphere));
    }

    startStory() {
        this.startTraining('neon-district');
    }

    startTraining(mapId = this.mapId) {
        this.stop();
        this.training = true;
        this.isRunning = true;
        this.mapId = mapId;
        this.trainingRound = 0;
        this.trainingKills = 0;
        this.trainingElapsed = 0;
        this.trainingLives = 3;
        this.storyChapter = 0;
        this.createMap(mapId);
        this.player.position.set(0, 0, 0);
        this.hp = 100;
        this.ammo = this.magazineSize;
        this.viewWeapon.visible = true;
        this.ui.ocultarTodas();
        this.ui.mostrarHUD(true);
        this.ui.ocultarFinPartida();
        this.ui.actualizarHUD(this.hp, `${this.ammo}/${this.magazineSize}`);
        this.nextTrainingRound();
        this.lastFrameTime = performance.now();
        this.animate();
    }

    nextTrainingRound() {
        this.trainingRound += 1;
        this.bots.forEach(bot => this.scene.remove(bot.mesh));
        this.bots.clear();
        const chapter = Math.min(2, Math.floor((this.trainingRound - 1) / 3));
        if (chapter !== this.storyChapter) {
            this.storyChapter = chapter;
            const chapterMap = ['neon-district', 'orbital-yard', 'reactor-core'][chapter];
            if (chapterMap !== this.mapId) {
                this.createMap(chapterMap);
                this.ui.addKillfeed(`Capítulo ${chapter + 1}: ${SCENARIOS[chapterMap].label}`);
            }
        }
        const count = Math.min(12, 2 + this.trainingRound);
        const archetype = ['soldier', 'drone', 'sentinel'][this.storyChapter];
        const hp = 80 + this.trainingRound * 10;
        for (let i = 0; i < count; i++) {
            const spawn = this.findBotSpawn(i, count);
            const mesh = this.createCharacter(i % 2 ? 0xff4d9d : 0xffa62b, archetype);
            mesh.position.copy(spawn);
            this.scene.add(mesh);
            this.bots.set(`bot-${i}`, { mesh, hp, cooldown: Math.random(), name: `${archetype === 'drone' ? 'Dron' : archetype === 'sentinel' ? 'Centinela' : 'Soldado'} ${i + 1}`, difficulty: this.trainingRound });
        }
        const roundHud = document.getElementById('hud-round');
        roundHud.hidden = false;
        roundHud.textContent = `RONDA ${this.trainingRound}`;
        this.ui.actualizarEntrenamiento(this.bots.size, this.trainingKills, this.trainingRound, this.trainingElapsed, this.trainingLives);
        this.ui.addKillfeed(`Ronda ${this.trainingRound}: objetivos desplegados`);
    }

    findBotSpawn(index, count) {
        const radius = 12 + Math.min(10, this.trainingRound * 1.5);
        for (let attempt = 0; attempt < 40; attempt++) {
            const angle = ((index + attempt * 0.618) / count) * Math.PI * 2;
            const distance = radius + (attempt % 4) * 2.5;
            const candidate = new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
            if (candidate.distanceTo(this.player.position) < 9) continue;
            if (this.canOccupy(candidate)) return candidate;
        }
        const safeSpawns = [
            new THREE.Vector3(-42, 0, -42),
            new THREE.Vector3(42, 0, -42),
            new THREE.Vector3(-42, 0, 42),
            new THREE.Vector3(42, 0, 42),
            new THREE.Vector3(0, 0, 42)
        ];
        return safeSpawns.find(candidate => this.canOccupy(candidate)) || new THREE.Vector3(0, 0, 42);
    }

    getShotData() {
        const origin = new THREE.Vector3();
        this.viewWeapon.userData.muzzle.getWorldPosition(origin);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        this.raycaster.set(this.camera.position, direction);
        const hit = this.raycaster.intersectObjects([...this.coverMeshes, ...Array.from(this.bots.values()).map(bot => bot.mesh)], true)[0];
        const aimPoint = hit ? hit.point : this.camera.position.clone().addScaledVector(direction, 100);
        return { origin, direction: aimPoint.sub(origin).normalize(), aimPoint };
    }

    shoot() {
        if (!this.isRunning || !this.canShoot || this.isReloading || this.isRespawning) return;
        if (this.ammo <= 0) return this.reload();
        this.canShoot = false;
        setTimeout(() => { this.canShoot = true; }, 250);
        this.ammo -= 1;
        this.ui.actualizarHUD(this.hp, `${this.ammo}/${this.magazineSize}`);
        const shot = this.getShotData();
        this.showMuzzleFlash();
        this.createTracer(shot.origin, shot.aimPoint, 0x8ffaff);
        this.raycaster.set(shot.origin, shot.direction);
        const coverHit = this.raycaster.intersectObjects(this.coverMeshes, true)[0];
        const botHit = this.raycaster.intersectObjects(Array.from(this.bots.values()).map(bot => bot.mesh), true)[0];
        if (botHit && (!coverHit || botHit.distance < coverHit.distance)) this.damageBot(this.findBot(botHit.object), 34);
        if (coverHit && (!botHit || coverHit.distance < botHit.distance)) this.createImpact(coverHit.point, 0xffd166);
        if (this.ammo === 0) this.reload();
    }

    findBot(object) {
        return Array.from(this.bots.entries()).find(([, bot]) => object === bot.mesh || object.parent === bot.mesh)?.[0] || null;
    }

    damageBot(id, damage) {
        if (!id) return;
        const bot = this.bots.get(id);
        if (!bot) return;
        bot.hp -= damage;
        this.createImpact(bot.mesh.position.clone().setY(1.2), 0xff4d9d);
        if (bot.hp > 0) return;
        this.trainingKills += 1;
        const xp = 20 + this.trainingRound * 5 + (this.storyChapter * 10);
        const coins = 4 + this.trainingRound * 2 + (this.storyChapter * 3);
        if (this.onProgress) this.onProgress({ xp, coins });
        this.ui.actualizarEntrenamiento(this.bots.size - 1, this.trainingKills, this.trainingRound, this.trainingElapsed, this.trainingLives);
        this.ui.addKillfeed(`${this.playerName} neutralizó a ${bot.name}`);
        this.scene.remove(bot.mesh);
        this.bots.delete(id);
        if (this.bots.size === 0) {
                this.trainingNextRoundTimer = setTimeout(() => this.nextTrainingRound(), 1600);
        }
    }

    showMuzzleFlash() {
        const flash = this.viewWeapon.userData.flash;
        flash.material.opacity = 1;
        flash.scale.setScalar(1 + Math.random() * 0.45);
        this.effects.push({ object: flash, life: 0.07, maxLife: 0.07, type: 'flash' });
    }

    createTracer(start, end, color) {
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        line.material.depthTest = false;
        line.renderOrder = 30;
        this.scene.add(line);
        this.tracers.push({ object: line, life: 0.22, maxLife: 0.22 });
    }

    createImpact(position, color) {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true }));
        marker.position.copy(position);
        this.scene.add(marker);
        this.effects.push({ object: marker, life: 0.5, maxLife: 0.5, type: 'impact' });
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
        }, 900);
    }

    updateBots(dt) {
        if (this.isRespawning) return;
        this.bots.forEach(bot => {
            const offset = this.player.position.clone().sub(bot.mesh.position);
            const distance = offset.length();
            const flat = new THREE.Vector3(offset.x, 0, offset.z);
            if (distance > 6 && flat.lengthSq() > 0) {
                flat.normalize();
                const next = bot.mesh.position.clone().addScaledVector(flat, (1.05 + this.trainingRound * 0.1) * dt);
                if (this.canOccupy(next)) bot.mesh.position.copy(next);
            }
            bot.mesh.rotation.y = Math.atan2(this.player.position.x - bot.mesh.position.x, this.player.position.z - bot.mesh.position.z) + Math.PI;
            const stride = Math.sin(this.trainingElapsed * 8 + bot.mesh.position.x) * Math.min(0.16, flat.length() * 0.04);
            if (bot.mesh.userData.archetype === 'drone') {
                bot.mesh.position.y = 0.15 + Math.sin(this.trainingElapsed * 3 + bot.mesh.position.z) * 0.08;
                bot.mesh.rotation.z = Math.sin(this.trainingElapsed * 4 + bot.mesh.position.x) * 0.05;
            } else {
                bot.mesh.userData.legs?.[0].rotation.x = stride;
                bot.mesh.userData.legs?.[1].rotation.x = -stride;
            }
            bot.cooldown -= dt;
            if (distance < 30 && bot.cooldown <= 0) {
                bot.cooldown = Math.max(0.34, 1.45 - this.trainingRound * 0.07);
                const origin = bot.mesh.position.clone().setY(1.4);
                const target = this.player.position.clone().setY(1.25);
                this.raycaster.set(origin, target.sub(origin).normalize());
                const obstacle = this.raycaster.intersectObjects(this.coverMeshes, true)[0];
                if (!obstacle || obstacle.distance > origin.distanceTo(this.player.position)) {
                    this.createTracer(origin, this.player.position.clone().setY(1.35), 0xff4d9d);
                    this.receiveDamage(Math.round(8 + Math.min(18, this.trainingRound * 1.2)));
                }
            }
        });
    }

    receiveDamage(damage) {
        if (this.isRespawning) return;
        this.hp = Math.max(0, Math.round(this.hp - damage));
        this.ui.actualizarHUD(this.hp, `${this.ammo}/${this.magazineSize}`);
        if (this.hp <= 0) this.respawn();
    }

    respawn() {
        this.trainingLives -= 1;
        this.ui.actualizarEntrenamiento(this.bots.size, this.trainingKills, this.trainingRound, this.trainingElapsed, this.trainingLives);
        if (this.trainingLives <= 0) {
            this.ui.mostrarFinPartida('Fin de la misión', [`Bajas: ${this.trainingKills}`, `Ronda alcanzada: ${this.trainingRound}`, 'Vuelve a intentarlo para superar tu marca.']);
            this.stop();
            return;
        }
        this.isRespawning = true;
        this.ui.mostrarRespawn(3);
        let seconds = 3;
        this.respawnTimer = setInterval(() => {
            seconds -= 1;
            if (seconds <= 0) {
                clearInterval(this.respawnTimer);
                this.respawnTimer = null;
                this.isRespawning = false;
                this.hp = 100;
                this.player.position.set(0, 0, 0);
                this.ui.ocultarRespawn();
                this.ui.actualizarEntrenamiento(this.bots.size, this.trainingKills, this.trainingRound, this.trainingElapsed, this.trainingLives);
            } else {
                this.ui.mostrarRespawn(seconds);
            }
        }, 1000);
    }

    animate() {
        if (!this.isRunning) return;
        this.animationFrame = requestAnimationFrame(() => this.animate());
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;
        this.updateBots(dt);
        if (this.training) {
            this.trainingElapsed += dt;
            this.ui.actualizarEntrenamiento(this.bots.size, this.trainingKills, this.trainingRound, this.trainingElapsed, this.trainingLives);
        }

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(this.mouseY, this.mouseX, 0);
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
        const speed = this.keys.shift ? 8.5 : 5.2;
        this.moveVelocity.x = THREE.MathUtils.damp(this.moveVelocity.x, wish.x * speed, 24, dt);
        this.moveVelocity.z = THREE.MathUtils.damp(this.moveVelocity.z, wish.z * speed, 24, dt);
        const nextX = this.player.position.clone().addScaledVector(new THREE.Vector3(this.moveVelocity.x, 0, 0), dt);
        const nextZ = this.player.position.clone().addScaledVector(new THREE.Vector3(0, 0, this.moveVelocity.z), dt);
        if (this.canOccupy(nextX)) this.player.position.x = nextX.x;
        if (this.canOccupy(nextZ)) this.player.position.z = nextZ.z;
        if (this.keys.space && this.player.position.y <= 0.001) this.velocityY = 7;
        this.velocityY -= 20 * dt;
        this.player.position.y = Math.max(0, this.player.position.y + this.velocityY * dt);
        this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -90, 90);
        this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -90, 90);
        this.player.rotation.y = this.mouseX;

        const moving = wish.lengthSq() > 0 && this.player.position.y <= 0.001;
        const bob = moving ? Math.sin(now * 0.012) * 0.035 : 0;
        this.camera.position.set(this.player.position.x, this.player.position.y + 1.62 + bob, this.player.position.z);
        this.viewWeapon.position.y = bob;
        this.viewWeapon.rotation.z = moving ? Math.sin(now * 0.012) * 0.012 : 0;
        this.updateEffects(dt);
        this.renderer.render(this.scene, this.camera);
    }

    updateEffects(dt) {
        this.tracers = this.tracers.filter(effect => {
            effect.life -= dt;
            effect.object.material.opacity = Math.max(0, effect.life / effect.maxLife);
            if (effect.life <= 0) {
                this.scene.remove(effect.object);
                effect.object.geometry.dispose();
                effect.object.material.dispose();
                return false;
            }
            return true;
        });
        this.effects = this.effects.filter(effect => {
            effect.life -= dt;
            if (effect.type === 'flash') effect.object.material.opacity = Math.max(0, effect.life / effect.maxLife);
            if (effect.type === 'impact') effect.object.scale.setScalar(1 + (1 - effect.life / effect.maxLife) * 2);
            if (effect.life <= 0) {
                this.scene.remove(effect.object);
                if (effect.type === 'impact') {
                    effect.object.geometry.dispose();
                    effect.object.material.dispose();
                }
                return false;
            }
            return true;
        });
    }

    stop() {
        this.isRunning = false;
        this.training = false;
        this.trainingKills = 0;
        this.trainingElapsed = 0;
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
        if (this.trainingNextRoundTimer) clearTimeout(this.trainingNextRoundTimer);
        if (this.respawnTimer) clearInterval(this.respawnTimer);
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.trainingNextRoundTimer = null;
        this.respawnTimer = null;
        this.reloadTimer = null;
        this.bots.forEach(bot => this.scene.remove(bot.mesh));
        this.bots.clear();
        this.tracers.forEach(effect => this.scene.remove(effect.object));
        this.tracers = [];
        this.effects.forEach(effect => this.scene.remove(effect.object));
        this.effects = [];
        this.isRespawning = false;
        this.isReloading = false;
        this.canShoot = true;
        if (this.viewWeapon) this.viewWeapon.visible = false;
        if (document.pointerLockElement) document.exitPointerLock();
    }
}
