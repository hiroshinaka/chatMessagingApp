const express = require('express');
const router = express.Router();
const db = require('../databaseConnection');

//Send a message
router.post('send', async (req, res) => {
    const {room_user_idm text} = req.body;
    try{
        await db.query('INSERT INTO messages (room_user_id, text) VALUES (?, ?, NOW())', [room_user_id, text]);
        res.status(201).json({ success: true, message: "Message sent!" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

//Get messages from a room

router.get("/history/:room_id", async (req, res) => {
    const { room_id } = req.params;
    try {
        const [messages] = await db.query(
            `SELECT m.text, m.sent_datetime, u.username 
             FROM message m 
             JOIN room_user ru ON m.room_user_id = ru.room_user_id
             JOIN user u ON ru.user_id = u.user_id
             WHERE ru.room_id = ?
             ORDER BY m.sent_datetime ASC`,
            [room_id]
        );
        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;