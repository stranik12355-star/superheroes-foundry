/* scripts/superheroes-features.js */

Hooks.once("init", () => {
    console.log("Супергерои | Инициализация дополнительных механик (ХП, Токены, Досье)");

    // Отключаем стандартные полоски ХП и ресурсов в Foundry
    const originalDrawBars = Token.prototype.drawBars;
    Token.prototype.drawBars = function() {
        if (this.bars) {
            this.bars.visible = false;
        }
    };

    // Создаем HTML элемент для кастомного текста статуса при наведении
    const statusDiv = document.createElement("div");
    statusDiv.id = "sh-token-status";
    document.body.appendChild(statusDiv);
});

// Оставляем только два варианта в настройках токена
Hooks.on("renderTokenConfig", (app, html, data) => {
    const select = html.find('select[name="displayBars"]');
    if (select.length) {
        select.find('option').not('[value="20"], [value="30"]').remove();
    }
});

// Механика текста при наведении
Hooks.on("hoverToken", (token, hovered) => {
    const statusDiv = document.getElementById("sh-token-status");
    if (!statusDiv) return;

    if (!hovered || !token.actor) {
        statusDiv.classList.remove("visible");
        return;
    }

    const actor = token.actor;
    const hp = actor.system.health?.value || 0;
    const maxHp = actor.system.health?.max || 1;
    const percent = hp / maxHp;

    const displayMode = token.document.displayBars;
    const isOwner = token.document.isOwner;
    
    // Новая логика видимости строго по настройкам токена
    let canSee = false;
    if (displayMode === 30) canSee = true; // 30 = Hover by Anyone (При наведении всеми)
    if (displayMode === 20 && isOwner) canSee = true; // 20 = Hover by Owner (При наведении владельцем)

    let statusText = "Неизвестно";
    let statusClass = "status-unknown";

    if (canSee) {
        if (hp <= 0) {
            statusText = "Без сознания";
            statusClass = "status-dead";
        } else if (percent < 0.25) {
            statusText = "Тяжело ранен";
            statusClass = "status-heavy";
        } else if (percent < 0.50) {
            statusText = "Ранен";
            statusClass = "status-medium";
        } else if (percent < 1.0) {
            statusText = "Слегка ранен";
            statusClass = "status-light";
        } else {
            statusText = "Без повреждений";
            statusClass = "status-perfect";
        }
    }

    statusDiv.textContent = statusText;
    statusDiv.className = `visible ${statusClass}`;

    const updatePosition = () => {
        if (!statusDiv.classList.contains("visible")) {
            canvas.app.ticker.remove(updatePosition);
            return;
        }
        
        const x = token.center.x;
        const y = token.y - 10; 
        
        const transform = canvas.stage.worldTransform;
        const screenX = (x * transform.a) + transform.tx;
        const screenY = (y * transform.d) + transform.ty;

        statusDiv.style.left = `${screenX}px`;
        statusDiv.style.top = `${screenY}px`;
    };

    canvas.app.ticker.add(updatePosition);
});

// Механика покраснения (тонирования) токена при получении ран
Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (game.user.id !== userId) return;

    if (foundry.utils.hasProperty(changes, "system.health.value")) {
        const hp = foundry.utils.getProperty(changes, "system.health.value");
        const maxHp = actor.system.health?.max || 1;
        const percent = hp / maxHp;

        let tintColor = "#ffffff";

        if (percent <= 0) {
            tintColor = "#550000"; 
        } else if (percent <= 0.25) {
            tintColor = "#ff4444"; 
        } else if (percent <= 0.50) {
            tintColor = "#ffb3b3"; 
        }

        if (canvas.ready) {
            const tokens = actor.getActiveTokens();
            const updates = tokens.map(t => ({ _id: t.id, "texture.tint": tintColor }));
            if (updates.length > 0) {
                canvas.scene.updateEmbeddedDocuments("Token", updates);
            }
        }
    }
});

/* ===== ФУНКЦИЯ ПОДНЯТИЯ РУКИ ===== */
Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls) {
        tokenControls.tools.push({
            name: "raise-hand",
            title: "Поднять руку",
            icon: "fas fa-hand-paper",
            button: true,
            onClick: async () => {
                const userName = game.user.name;
                const content = `
                    <div style="display: flex; align-items: center; gap: 10px; background: #1a1a20; padding: 10px; border-left: 4px solid #e7b13a; border-radius: 5px; color: #fff;">
                        <i class="fas fa-hand-paper" style="font-size: 24px; color: #e7b13a;"></i>
                        <span style="font-size: 15px;"><strong>${userName}</strong> поднимает руку!</span>
                    </div>
                `;
                await ChatMessage.create({
                    speaker: { alias: "Система" },
                    content: content,
                    flags: { superheroes: { isHandRaise: true } }
                });
            }
        });
    }
});

Hooks.on("createChatMessage", (message) => {
    if (message.flags?.superheroes?.isHandRaise) {
        AudioHelper.play({ src: "systems/superheroes/assets/raise-hand.mp3", volume: 0.8, autoplay: true }, true);
    }
});