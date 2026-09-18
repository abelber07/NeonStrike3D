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

    mostrarHUD(mostrar) {
        document.getElementById('hud').hidden = !mostrar;
    }

    actualizarHUD(hp, ammo) {
        document.getElementById('hud-hp').textContent = Math.max(0, hp);
        document.getElementById('hud-hp-fill').style.width = `${Math.max(0, hp)}%`;
        document.getElementById('hud-ammo-count').textContent = ammo;
    }

    actualizarEntrenamiento(enemigos, bajas, ronda, segundos, vidas = 3) {
        document.getElementById('hud-enemies').textContent = enemigos;
        document.getElementById('hud-kills').textContent = bajas;
        document.getElementById('hud-lives').textContent = vidas;
        document.getElementById('hud-round').textContent = `RONDA ${ronda}`;
        const minutes = Math.floor(segundos / 60).toString().padStart(2, '0');
        const seconds = Math.floor(segundos % 60).toString().padStart(2, '0');
        document.getElementById('hud-phase-time').textContent = `${minutes}:${seconds}`;
    }

    addKillfeed(texto) {
        const feed = document.getElementById('killfeed');
        const li = document.createElement('li');
        li.textContent = texto;
        feed.appendChild(li);
        while (feed.children.length > 5) feed.firstElementChild.remove();
        setTimeout(() => li.remove(), 4000);
    }

    addKillEvent(killer, victim, streak = 0) {
        this.addKillfeed(`${killer} eliminó a ${victim}`);
        if ([3, 5, 10, 15].includes(streak)) {
            this.addKillfeed(`${killer} lleva una racha de ${streak} eliminaciones`);
        }
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

    renderItems(containerId, items, equippedId, onSelect) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        items.forEach(item => {
            const card = document.createElement('button');
            card.className = `item-card${item.id === equippedId ? ' equipped' : ''}`;
            card.type = 'button';
            card.innerHTML = `<span class="icon">${item.icon}</span><span class="name">${item.nombre}</span><span class="description">${item.descripcion}</span><span class="price">${item.precio ? `◈ ${item.precio}` : item.id === equippedId ? 'Equipado' : 'Gratis'}</span>`;
            card.addEventListener('click', () => onSelect(item));
            container.appendChild(card);
        });
    }

    renderBattlePass(tiers, level, onClaim) {
        const container = document.getElementById('bp-track');
        container.innerHTML = '';
        tiers.forEach(tier => {
            const unlocked = level >= tier.nivel;
            const card = document.createElement('div');
            card.className = `bp-tier${unlocked ? ' unlocked' : ''}`;
            card.innerHTML = `<div class="tier-num">NIVEL ${tier.nivel}</div><div class="reward">${tier.icon}</div><strong>${tier.recompensa}</strong>`;
            if (unlocked) {
                const button = document.createElement('button');
                button.className = 'chip';
                button.type = 'button';
                button.textContent = tier.reclamado ? 'Reclamado' : 'Reclamar';
                button.disabled = tier.reclamado;
                button.addEventListener('click', () => onClaim(tier));
                card.appendChild(button);
            }
            container.appendChild(card);
        });
    }
}