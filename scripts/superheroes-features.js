/* scripts/superheroes-features.js */

Hooks.once("init", () => {
    console.log("Супергерои | Инициализация дополнительных механик (ХП, Токены)");

    // 1. Отключаем стандартные полоски ХП и ресурсов в Foundry
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

// 2. Механика текста при наведении
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
    
    // Проверяем, может ли текущий игрок видеть статус
    let canSee = false;
    
    // 20 = OWNER (При наведении владельцем)
    // 30 = ALWAYS (При наведении всеми)
    if (displayMode === 30) {
        // Режим "При наведении всеми" — видят все
        canSee = true;
    } else if (displayMode === 20) {
        // Режим "При наведении владельцем" — видит только владелец
        canSee = isOwner;
    }

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

// 3. Механика покраснения (тонирования) токена при получении ран
Hooks.on("updateActor", (actor, changes, options, userId) => {
    // Выполняем только у того, кто меняет ХП (чтобы не дублировать запросы)
    if (game.user.id !== userId) return;

    // Проверяем, изменилось ли здоровье
    if (foundry.utils.hasProperty(changes, "system.health.value")) {
        const hp = foundry.utils.getProperty(changes, "system.health.value");
        const maxHp = actor.system.health?.max || 1;
        const percent = hp / maxHp;

        let tintColor = "#ffffff"; // Обычный цвет (нет тонирования)

        if (percent <= 0) {
            tintColor = "#550000"; // Без сознания (тёмно-бордовый)
        } else if (percent <= 0.25) {
            tintColor = "#ff4444"; // Тяжело ранен (ярко-красный)
        } else if (percent <= 0.50) {
            tintColor = "#ffb3b3"; // Ранен (бледно-красный/розовый)
        }

        // Обновляем все токены этого актера на карте
        if (canvas.ready) {
            const tokens = actor.getActiveTokens();
            const updates = tokens.map(t => ({ _id: t.id, "texture.tint": tintColor }));
            if (updates.length > 0) {
                canvas.scene.updateEmbeddedDocuments("Token", updates);
            }
        }
    }
});

// 4. Ограничение настроек токена — оставляем только 2 варианта для шкал и имени
Hooks.on("renderTokenConfig", (app, html, data) => {
    // Находим селект для отображения шкал ресурсов (displayBars)
    const barsSelect = html.find('select[name="displayBars"]');
    if (barsSelect.length > 0) {
        const options = barsSelect.find('option');
        options.each(function() {
            const val = parseInt($(this).val());
            // Оставляем только: 20 (Владельцем) и 30 (Всеми)
            if (val !== 20 && val !== 30) {
                $(this).remove();
            }
        });
    }

    // Находим селект для отображения имени (displayName)
    const nameSelect = html.find('select[name="displayName"]');
    if (nameSelect.length > 0) {
        const options = nameSelect.find('option');
        options.each(function() {
            const val = parseInt($(this).val());
            // Оставляем только: 20 (Владельцем) и 30 (Всеми)
            if (val !== 20 && val !== 30) {
                $(this).remove();
            }
        });
    }
});

/* ===== ФУНКЦИЯ ПОДНЯТИЯ РУКИ ===== */

// 1. Добавляем кнопку в левое меню (инструменты токенов)
Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls) {
        tokenControls.tools.push({
            name: "raise-hand",
            title: "Поднять руку",
            icon: "fas fa-hand-paper", // Иконка ладони
            button: true, // Кнопка, а не переключатель
            onClick: async () => {
                const userName = game.user.name;
                
                // Красивое сообщение для чата
                const content = `
                    <div style="display: flex; align-items: center; gap: 10px; background: #1a1a20; padding: 10px; border-left: 4px solid #e7b13a; border-radius: 5px; color: #fff;">
                        <i class="fas fa-hand-paper" style="font-size: 24px; color: #e7b13a;"></i>
                        <span style="font-size: 15px;"><strong>${userName}</strong> поднимает руку!</span>
                    </div>
                `;

                // Создаем сообщение в чате с секретным флагом
                await ChatMessage.create({
                    speaker: { alias: "Система" },
                    content: content,
                    flags: { superheroes: { isHandRaise: true } }
                });
            }
        });
    }
});

// 2. Отлавливаем сообщение у ВСЕХ игроков и играем звук
Hooks.on("createChatMessage", (message) => {
    // Если в сообщении есть наш флаг поднятой руки
    if (message.flags?.superheroes?.isHandRaise) {
        // Проигрываем звук (путь к твоему mp3)
        AudioHelper.play({ 
            src: "systems/superheroes/assets/raise-hand.mp3", 
            volume: 0.8, 
            autoplay: true 
        }, true);
    }
});