const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============= MIDDLEWARE =============
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============= ПУТИ ДЛЯ СТАТИКИ (ВАЖНО!) =============
// Корневая папка проекта (на уровень выше backend)
const rootPath = path.join(__dirname, '..');
console.log('📁 Корневая папка:', rootPath);

// Раздаём статические файлы из корня
app.use(express.static(rootPath));

// ============= БАЗА ДАННЫХ =============
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT,
            avatar TEXT,
            balance REAL DEFAULT 0,
            level INTEGER DEFAULT 1,
            ads INTEGER DEFAULT 0,
            is_premium INTEGER DEFAULT 0,
            language TEXT DEFAULT 'ru',
            telegram_id TEXT,
            referrer_id TEXT,
            total_views INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (unixepoch()),
            last_active INTEGER DEFAULT (unixepoch())
        )
    `);
    
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
    
    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id TEXT,
            referred_id TEXT,
            reward REAL DEFAULT 0,
            created_at INTEGER DEFAULT (unixepoch()),
            FOREIGN KEY (referrer_id) REFERENCES users(id),
            FOREIGN KEY (referred_id) REFERENCES users(id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            type TEXT,
            amount REAL,
            description TEXT,
            created_at INTEGER DEFAULT (unixepoch()),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    
    console.log('✅ База данных инициализирована');
});

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function generateUsername() {
    const names = ['CryptoMaster', 'AdKing', 'TokenHunter', 'RewardSeeker', 'LevelUp', 'Miner', 'EagleEye', 'FastClick', 'GoldRush', 'CoinCollector'];
    return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
}

function logTransaction(userId, type, amount, description) {
    db.run(
        'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
        [userId, type, amount, description],
        (err) => {
            if (err) console.error('Ошибка записи транзакции:', err);
        }
    );
}

// ============= API ENDPOINTS =============

app.post('/api/user', (req, res) => {
    const { 
        userId, 
        username, 
        firstName, 
        lastName, 
        avatar, 
        languageCode, 
        isPremium,
        referrerId 
    } = req.body;
    
    const id = userId || `tg_${uuidv4()}`;
    const displayName = username || firstName || generateUsername();
    const userAvatar = avatar || `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`;
    
    console.log(`📌 Запрос пользователя: ${id}, Имя: ${displayName}`);
    
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            console.error('❌ Ошибка БД:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (user) {
            db.run(
                `UPDATE users SET 
                    username = ?, 
                    avatar = ?, 
                    is_premium = ?, 
                    language = ?,
                    last_active = unixepoch()
                WHERE id = ?`,
                [displayName, userAvatar, isPremium ? 1 : 0, languageCode || 'ru', id]
            );
            
            db.all('SELECT block_id, views, locked_until FROM user_blocks WHERE user_id = ?', [id], (err, blocks) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                const blocksData = {};
                blocks.forEach(b => {
                    blocksData[b.block_id] = { v: b.views, l: b.locked_until };
                });
                
                console.log(`✅ Пользователь загружен: ${displayName} (${id})`);
                
                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        username: displayName,
                        avatar: userAvatar,
                        balance: user.balance,
                        level: user.level,
                        ads: user.ads,
                        totalViews: user.total_views || 0
                    },
                    blocks: blocksData
                });
            });
        } else {
            db.run(
                `INSERT INTO users 
                 (id, username, avatar, balance, level, ads, is_premium, language, telegram_id, referrer_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, displayName, userAvatar, 0, 1, 0, isPremium ? 1 : 0, languageCode || 'ru', id.replace('tg_', ''), referrerId || null],
                (err) => {
                    if (err) {
                        console.error('❌ Ошибка создания:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    const stmt = db.prepare('INSERT INTO user_blocks (user_id, block_id, views, locked_until) VALUES (?, ?, ?, ?)');
                    for (let i = 1; i <= 3; i++) {
                        stmt.run(id, i, 0, 0);
                    }
                    stmt.finalize();
                    
                    if (referrerId && referrerId !== id) {
                        const bonusAmount = 0.01;
                        db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [bonusAmount, referrerId]);
                        db.run('INSERT INTO referrals (referrer_id, referred_id, reward) VALUES (?, ?, ?)', [referrerId, id, bonusAmount]);
                        logTransaction(referrerId, 'referral_bonus', bonusAmount, `За приглашение ${displayName}`);
                        console.log(`🎁 Реферальный бонус: ${referrerId} +${bonusAmount}$`);
                    }
                    
                    logTransaction(id, 'registration', 0, 'Регистрация нового пользователя');
                    console.log(`🆕 Новый пользователь: ${displayName} (${id})`);
                    
                    res.json({
                        success: true,
                        user: {
                            id: id,
                            username: displayName,
                            avatar: userAvatar,
                            balance: 0,
                            level: 1,
                            ads: 0,
                            totalViews: 0
                        },
                        blocks: {}
                    });
                }
            );
        }
    });
});

app.post('/api/save', (req, res) => {
    const { userId, user, blocks } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    db.run(
        `UPDATE users SET 
            balance = ?, 
            level = ?, 
            ads = ?,
            total_views = total_views + ?,
            last_active = unixepoch()
        WHERE id = ?`,
        [user.balance, user.level, user.ads, 1, userId],
        (err) => {
            if (err) {
                console.error('❌ Ошибка сохранения пользователя:', err);
                return res.status(500).json({ error: err.message });
            }
            
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
                .then(() => {
                    console.log(`💾 Прогресс сохранён: ${userId}, баланс: ${user.balance}`);
                    res.json({ success: true });
                })
                .catch(err => {
                    console.error('❌ Ошибка сохранения блоков:', err);
                    res.status(500).json({ error: err.message });
                });
        }
    );
});

app.get('/api/leaderboard', (req, res) => {
    db.all(
        `SELECT id, username, avatar, balance, level, total_views 
         FROM users 
         ORDER BY balance DESC 
         LIMIT 50`,
        (err, rows) => {
            if (err) {
                console.error('❌ Ошибка лидерборда:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log(`📊 Лидерборд: ${rows.length} игроков`);
            res.json(rows);
        }
    );
});

app.get('/api/stats', (req, res) => {
    db.get(
        `SELECT 
            COUNT(*) as totalUsers,
            SUM(balance) as totalBalance,
            AVG(level) as avgLevel,
            SUM(total_views) as totalViews
         FROM users`,
        (err, row) => {
            if (err) {
                console.error('❌ Ошибка статистики:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({
                totalUsers: row.totalUsers || 0,
                totalBalance: row.totalBalance || 0,
                avgLevel: Math.round((row.avgLevel || 1) * 10) / 10,
                totalViews: row.totalViews || 0
            });
        }
    );
});

app.get('/api/user/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        db.all('SELECT block_id, views, locked_until FROM user_blocks WHERE user_id = ?', [id], (err, blocks) => {
            const blocksData = {};
            blocks.forEach(b => {
                blocksData[b.block_id] = { v: b.views, l: b.locked_until };
            });
            res.json({ user, blocks: blocksData });
        });
    });
});

app.get('/api/referrals/:id', (req, res) => {
    const { id } = req.params;
    db.all(
        `SELECT r.*, u.username, u.avatar, u.level 
         FROM referrals r 
         JOIN users u ON r.referred_id = u.id 
         WHERE r.referrer_id = ? 
         ORDER BY r.created_at DESC`,
        [id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/transactions/:id', (req, res) => {
    const { id } = req.params;
    const limit = req.query.limit || 50;
    db.all(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [id, limit],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.post('/api/reset/:id', (req, res) => {
    const { id } = req.params;
    db.run('UPDATE users SET balance = 0, level = 1, ads = 0, total_views = 0 WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run('UPDATE user_blocks SET views = 0, locked_until = 0 WHERE user_id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            logTransaction(id, 'reset', 0, 'Сброс прогресса');
            res.json({ success: true, message: 'Progress reset' });
        });
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ============= ГЛАВНЫЙ МАРШРУТ =============
app.get('/', (req, res) => {
    const indexPath = path.join(rootPath, 'index.html');
    console.log('📄 Отдаём index.html из:', indexPath);
    res.sendFile(indexPath);
});

app.get('*', (req, res) => {
    const indexPath = path.join(rootPath, 'index.html');
    res.sendFile(indexPath);
});

app.use((err, req, res, next) => {
    console.error('❌ Ошибка сервера:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============= ЗАПУСК =============
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                     🚀 СЕРВЕР ЗАПУЩЕН                      ║
╠══════════════════════════════════════════════════════════╣
║  Порт: ${PORT}                                              
║  API:  http://localhost:${PORT}/api                        
║  Health: http://localhost:${PORT}/health                   
╠══════════════════════════════════════════════════════════╣
║  ✅ База данных SQLite подключена                          
║  ✅ CORS разрешён для всех                                 
║  ✅ Статика из папки: ${rootPath}                          
╚══════════════════════════════════════════════════════════╝
    `);
});
