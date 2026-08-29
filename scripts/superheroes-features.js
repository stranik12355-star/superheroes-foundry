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
    
    let canSee = false;
    if (displayMode === 40 || displayMode === 50) canSee = true;
    if ((displayMode === 20 || displayMode === 30) && isOwner) canSee = true;

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
