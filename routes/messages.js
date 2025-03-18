const express = require('express');
const router = express.Router();
const db = require('../databaseConnection');
const rooms = require('../database/rooms');
//Send a message
router.post('/send', async (req, res) => {
    const {room_user_idm, text} = req.body;
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

router.post('/:roomId/invite', async (req, res) => {    
    console.log('Invite request:', {
        roomId: req.params.roomId,
        userId: req.body.userId,
        timestamp: new Date().toISOString()
    });

    try {
        const result = await rooms.inviteUserToRoom(req.params.roomId, req.body.userId);
        console.log('Invite result:', result);
        
        if (result.success) {
            res.json({ success: true, message: 'User added successfully' });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Server error during invitation:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Make sure direct chats include participants array
router.get('/getChats', async (req, res) => {
    try {
        const chats = await getChatList(req.user.id);
        res.json(chats.map(chat => ({
            ...chat,
            // For direct chats, include participants array
            participants: chat.type === 'direct' ? getChatParticipants(chat.room_id) : []
        })));
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
module.exports = router;