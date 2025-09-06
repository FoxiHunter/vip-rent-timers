(function () {
    function loadUsers() {
        try {
            return JSON.parse(localStorage.getItem('vipUsersRUNotify')) || [];
        } catch {
            return [];
        }
    }

    function saveUsers(users) {
        localStorage.setItem('vipUsersRUNotify', JSON.stringify(users));
    }

    let activeIntervals = [];

    function clearAllIntervals() {
        for (const id of activeIntervals) clearInterval(id);
        activeIntervals = [];
    }

    function renderUsers(users) {
        clearAllIntervals();
        const activeContainer = document.getElementById('active-users');
        const expiredContainer = document.getElementById('expired-users');
        activeContainer.innerHTML = '';
        expiredContainer.innerHTML = '';

        users.forEach((user, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<h3>${user.nickname}</h3><div class="time-left"></div><div class="status"></div><button class="delete">Удалить</button>`;

            const timeLeftDiv = card.querySelector('.time-left');
            const statusDiv = card.querySelector('.status');
            const deleteButton = card.querySelector('.delete');

            deleteButton.addEventListener('click', () => {
                users.splice(index, 1);
                saveUsers(users);
                renderUsers(users);
            });

            activeContainer.appendChild(card);

            function updateTime() {
                const diff = user.expires - Date.now();

                if (diff <= 0) {
                    statusDiv.textContent = 'Просрочено';
                    timeLeftDiv.textContent = 'Оставшееся время: 0с';

                    if (!card.classList.contains('expired')) {
                        card.classList.add('expired');
                        expiredContainer.appendChild(card);

                        if (!user.notified) {
                            if ('Notification' in window && Notification.permission === 'granted') {
                                new Notification('Аренда завершена', { body: `Срок аренды для ${user.nickname} истек.` });
                            }
                            const audio = document.getElementById('notificationSound');
                            if (audio) {
                                audio.currentTime = 0;
                                audio.play();
                                setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 5000);
                            }
                            user.notified = true;
                            saveUsers(users);
                        }
                    }
                    return;
                }

                const seconds = Math.floor((diff / 1000) % 60);
                const minutes = Math.floor((diff / (1000 * 60)) % 60);
                const hours = Math.floor(diff / (1000 * 60 * 60));

                statusDiv.textContent = 'Активно';
                timeLeftDiv.textContent = `Оставшееся время: ${hours}ч ${minutes}м ${seconds}с`;
            }

            updateTime();
            const id = setInterval(updateTime, 1000);
            activeIntervals.push(id);
        });
    }

    function createSnowflakes() {
        const container = document.querySelector('.snowflakes');
        const count = 40;
        for (let i = 0; i < count; i++) {
            const flake = document.createElement('div');
            flake.className = 'snowflake';
            const size = Math.random() * 6 + 4;
            flake.style.width = size + 'px';
            flake.style.height = size + 'px';
            flake.style.left = Math.random() * 100 + '%';
            flake.style.animationDuration = (Math.random() * 7 + 5) + 's';
            flake.style.animationDelay = (Math.random() * 5) + 's';
            container.appendChild(flake);
        }
    }

    function requestNotification() {
        if ('Notification' in window) Notification.requestPermission();
    }

    function init() {
        createSnowflakes();
        requestNotification();

        const nicknameInput = document.getElementById('nickname');
        const valueInput = document.getElementById('durationValue');
        const unitSelect = document.getElementById('durationUnit');
        const addBtn = document.getElementById('add-user-button');

        const users = loadUsers();
        renderUsers(users);

        addBtn.addEventListener('click', () => {
            const nickname = nicknameInput.value.trim();
            const value = parseFloat(valueInput.value.trim());
            const unit = unitSelect.value;

            if (!nickname || isNaN(value) || value <= 0) {
                alert('Пожалуйста, введите корректные данные.');
                return;
            }

            const now = Date.now();
            const expires = unit === 'minutes' ? now + value * 60 * 1000 : now + value * 60 * 60 * 1000;

            users.push({ nickname, expires, notified: false });
            saveUsers(users);

            nicknameInput.value = '';
            valueInput.value = '';
            unitSelect.value = 'hours';

            renderUsers(users);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
