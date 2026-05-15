const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // для фронта

// Подключение к БД
const db = new sqlite3.Database('./database.db');

// Создание таблиц
db.serialize(() => {
    // Таблица пользователей
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT,
            avatar TEXT,
            balance REAL DEFAULT 0,
            level INTEGER DEFAULT 1,
            ads INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (unixepoch())
        )
    `);
    
    // Таблица блоков рекламы для каждого пользователя
    db.run(`
        CREATE TABLE IF NOT EXISTS user_blocks (
            user_id TEXT,
            block_id INTEGER,
            views INTEGER DEFAULT 0,
            locked_until INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, block_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
});

// ============= API ENDPOINTS =============

// 1. Создание/получение пользователя
app.post('/api/user', (req, res) => {
    const { userId, username, avatar } = req.body;
    const id = userId || uuidv4();
    
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (user) {
            // Пользователь существует, получаем его блоки
            db.all('SELECT block_id, views, locked_until FROM user_blocks WHERE user_id = ?', [id], (err, blocks) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                const blocksData = {};
                blocks.forEach(b => {
                    blocksData[b.block_id] = { v: b.views, l: b.locked_until };
                });
                
                res.json({
                    user: {
                        id: user.id,
                        username: user.username,
                        avatar: user.avatar,
                        balance: user.balance,
                        level: user.level,
                        ads: user.ads
                    },
                    blocks: blocksData
                });
            });
        } else {
            // Создаём нового пользователя
            const newUsername = username || `Player_${Math.floor(Math.random() * 10000)}`;
            const newAvatar = avatar || `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`;
            
            db.run(
                'INSERT INTO users (id, username, avatar, balance, level, ads) VALUES (?, ?, ?, ?, ?, ?)',
                [id, newUsername, newAvatar, 0, 1, 0],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    // Создаём 3 блока для нового пользователя
                    const stmt = db.prepare('INSERT INTO user_blocks (user_id, block_id, views, locked_until) VALUES (?, ?, ?, ?)');
                    for (let i = 1; i <= 3; i++) {
                        stmt.run(id, i, 0, 0);
                    }
                    stmt.finalize();
                    
                    res.json({
                        user: {
                            id: id,
                            username: newUsername,
                            avatar: newAvatar,
                            balance: 0,
                            level: 1,
                            ads: 0
                        },
                        blocks: {}
                    });
                }
            );
        }
    });
});

// 2. Сохранение прогресса после просмотра
app.post('/api/save', (req, res) => {
    const { userId, user, blocks } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    // Обновляем данные пользователя
    db.run(
        'UPDATE users SET balance = ?, level = ?, ads = ? WHERE id = ?',
        [user.balance, user.level, user.ads, userId],
        (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Обновляем блоки
            const promises = [];
            for (const [blockId, blockData] of Object.entries(blocks)) {
                promises.push(new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE user_blocks SET views = ?, locked_until = ? WHERE user_id = ? AND block_id = ?',
                        [blockData.v, blockData.l, userId, blockId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                }));
            }
            
            Promise.all(promises)
                .then(() => res.json({ success: true }))
                .catch(err => res.status(500).json({ error: err.message }));
        }
    );
});

// 3. Получение лидерборда (топ по балансу)
app.get('/api/leaderboard', (req, res) => {
    db.all(
        'SELECT id, username, avatar, balance, level FROM users ORDER BY balance DESC LIMIT 50',
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

// 4. Получение статистики (общее количество пользователей)
app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users', (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            totalUsers: row.totalUsers || 0,
            totalBalance: row.totalBalance || 0
        });
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📱 Открой в браузере: http://localhost:${PORT}`);
});