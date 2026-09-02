/* scripts/superheroes-features.js */

Hooks.once("init", () => {
    console.log("Супергерои | Инициализация дополнительных механик (ХП, Токены)");

    // 1. Безопасно отключаем стандартные рисуемые полоски ХП в Foundry v12
    Token.prototype._drawAttributeBar = function(bounds, pct, color) {
        return; // Ничего не рисуем
    };

    // Создаем HTML элемент для кастомного текста статуса при наведении
    let statusDiv = document.getElementById("sh-token-status");
    if (!statusDiv) {
        statusDiv = document.createElement("div");
        statusDiv.id = "sh-token-status";
        document.body.appendChild(statusDiv);
    }
});

// 2. Ограничиваем выбор отображения ресурсов в настройках токена только 2 вариантами
Hooks.on("renderTokenConfig", (app, html) => {
    const root = html[0] || html;
    const displaySelect = root.querySelector("select[name='displayBars']");
    if (displaySelect) {
        const currentVal = app.document.displayBars;
        displaySelect.innerHTML = `
            <option value="20" ${currentVal === 20 ? "selected" : ""}>При наведении владельцем</option>
            <option value="30" ${currentVal === 30 ? "selected" : ""}>При наведении всеми</option>
        `;
    }
});

// 3. Механика текста при наведении с правильным управлением правами и тикером
Hooks.on("hoverToken", (token, hovered) => {
    const statusDiv = document.getElementById("sh-token-status");
    if (!statusDiv) return;

    // Очищаем старый тикер у токена, если он был
    if (token._statusTicker) {
        canvas.app.ticker.remove(token._statusTicker);
        token._statusTicker = null;
    }

    if (!hovered || !token.actor) {
        statusDiv.classList.remove("visible");
        return;
    }

    const actor = token.actor;
    const hp = actor.system.health?.value ?? 0;
    const maxHp = actor.system.health?.max || 1;
    const percent = hp / maxHp;

    const displayMode = token.document.displayBars;
    const isOwner = token.isOwner;
    const isGM = game.user.isGM;
    
    // Проверка видимости: ГМ видит всегда; Вручную "всеми" (30); Владельцем (20) только если владелец
    let canSeeRealStatus = false;
    if (isGM) {
        canSeeRealStatus = true;
    } else if (displayMode === 30) {
        canSeeRealStatus = true;
    } else if (displayMode === 20 && isOwner) {
        canSeeRealStatus = true;
    }

    let statusText = "Неизвестно";
    let statusClass = "status-unknown";

    if (canSeeRealStatus) {
        if (hp <= 0) {
            statusText = "Без сознания";
            statusClass = "status-dead";
        } else if (percent <= 0.25) {
            statusText = "Тяжело ранен";
            statusClass = "status-heavy";
        } else if (percent <= 0.50) {
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
        if (!statusDiv.classList.contains("visible") || !token.rendered) {
            if (token._statusTicker) {
                canvas.app.ticker.remove(token._statusTicker);
                token._statusTicker = null;
            }
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

    token._statusTicker = updatePosition;
    canvas.app.ticker.add(token._statusTicker);
});

// 4. Механика покраснения (тонирования) токена при получении ран
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

// 5. Функция поднятия руки
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

// 6. Проигрывание звука поднятой руки для всех пользователей
Hooks.on("createChatMessage", (message) => {
    if (message.flags?.superheroes?.isHandRaise) {
        AudioHelper.play({ 
            src: "systems/superheroes/assets/raise-hand.mp3", 
            volume: 0.8, 
            autoplay: true 
        }, true);
    }
});