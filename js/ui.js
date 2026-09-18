// js/ui.js
export class UIManager {
    constructor() {
        this.screens = document.querySelectorAll('.screen');
        this.userData = null;
    }

    showScreen(screenId) {
        this.screens.forEach(s => s.classList.remove('active'));
        if (!screenId) return;
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');
    }

    ocultarTodas() {
        this.screens.forEach(s => s.classList.remove('active'));
    }

    updatePlayerUI(userData) {
        this.userData = userData;
        document.getElementById('menu-name').textContent = userData.nombre || "Jugador";
        document.getElementById('menu-tag').textContent = userData.tagEquipado || "[N00B]";
        document.getElementById('menu-level').textContent = userData.nivel || 1;
        document.getElementById('menu-coins').textContent = userData.monedas || 0;
        document.getElementById('menu-avatar').textContent = (userData.nombre || "J")[0].toUpperCase();

        const xpActual = (userData.xp || 0) % 100;
        document.getElementById('menu-xp-fill').style.width = `${xpActual}%`;
        document.getElementById('menu-xp-text').textContent = `${xpActual}/100 XP`;

        document.getElementById('shop-coins').textContent = userData.monedas || 0;
        document.getElementById('bp-coins').textContent = userData.monedas || 0;
    }

    updateLobbyUI(players, isHost) {
        const list = document.getElementById('lobby-players');
        list.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.name}${p.isHost ? ' 👑' : ''}`;
            list.appendChild(li);
        });
        document.getElementById('lobby-count').textContent = players.length;

        const btnStart = document.getElementById('btn-start');
        btnStart.disabled = !isHost || players.length < 1;
    }

    mostrarHUD(mostrar) {
        document.getElementById('hud').hidden = !mostrar;
    }

    actualizarHUD(hp, ammo) {
        document.getElementById('hud-hp').textContent = Math.max(0, hp);
        document.getElementById('hud-hp-fill').style.width = `${Math.max(0, hp)}%`;
        document.getElementById('hud-ammo-count').textContent = ammo;
    }

    actualizarScoreboard(jugadores, modo) {
        document.getElementById('hud-mode').textContent = modo.toUpperCase();
        const rows = document.getElementById('hud-rows');
        rows.innerHTML = '';
        const ordenados = [...jugadores].sort((a, b) => (b.kills || 0) - (a.kills || 0));
        ordenados.forEach((j, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span><span class="rank">#${i + 1}</span>${j.name} <span class="tag">${j.tag || ''}</span></span><span>${j.kills || 0} kills</span>`;
            rows.appendChild(li);
        });
    }

    addKillfeed(texto) {
        const feed = document.getElementById('killfeed');
        const li = document.createElement('li');
        li.textContent = texto;
        feed.appendChild(li);
        setTimeout(() => li.remove(), 4000);
    }

    mostrarRespawn(segundos) {
        const overlay = document.getElementById('respawn-overlay');
        overlay.hidden = false;
        document.getElementById('respawn-timer').textContent = segundos;
    }

    ocultarRespawn() {
        document.getElementById('respawn-overlay').hidden = true;
    }

    mostrarFinPartida(titulo, stats) {
        document.getElementById('match-end-title').textContent = titulo;
        const ul = document.getElementById('match-end-stats');
        ul.innerHTML = '';
        stats.forEach(s => {
            const li = document.createElement('li');
            li.textContent = s;
            ul.appendChild(li);
        });
        document.getElementById('match-end').hidden = false;
    }
}