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

    // Проверка прав (Опираемся на настройки токена displayBars)
    const displayMode = token.document.displayBars;
    const isOwner = token.document.isOwner;
    
    // 20 = При наведении владельцем, 30 = Всегда для владельца
    // 40 = При наведении всеми, 50 = Всегда для всех
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

    // Обновляем позицию текста над токеном каждую отрисовку кадра, пока наведена мышка
    const updatePosition = () => {
        if (!statusDiv.classList.contains("visible")) {
            canvas.app.ticker.remove(updatePosition);
            return;
        }
        
        // Координаты токена на экране
        const x = token.center.x;
        const y = token.y - 10; // Чуть выше токена
        
        // Переводим координаты холста в координаты экрана
        const transform = canvas.stage.worldTransform;
        const screenX = (x * transform.a) + transform.tx;
        const screenY = (y * transform.d) + transform.ty;

        statusDiv.style.left = `${screenX}px`;
        statusDiv.style.top = `${screenY}px`;
    };

    canvas.app.ticker.add(updatePosition);
});