# YM7 Hobby 🚀

A modern revival of the classic Yahoo Messenger 7 with enhanced security, real-time messaging, and nostalgic interface.

## ✨ Features

- **🔐 Secure Authentication** - JWT tokens with refresh capability
- **💬 Real-time Messaging** - WebSocket-based instant messaging
- **👥 Buddy System** - Add, manage, and chat with buddies
- **🌐 Modern Web Interface** - Responsive design with classic YM7 look
- **🛡️ Enterprise Security** - Rate limiting, input validation, SQL injection protection
- **📱 Multi-device Support** - Connect from multiple devices simultaneously
- **🔔 Live Notifications** - Real-time buddy status and message alerts

## 🏗️ Architecture

YM/
├── backend/
│   ├── config/
│   │   ├── database.js
│   │   └── production.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── rateLimit.js
│   │   └── validation.js
│   ├── modules/
│   │   ├── auth.js
│   │   ├── buddies.js
│   │   ├── emailService.js
│   │   ├── passwordReset.js
│   │   ├── tokenBlacklist.js
│   │   └── tokenManager.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── buddies.js
│   │   ├── messages.js
│   │   ├── users.js
│   │   └── verification.js
│   ├── utils/
│   │   ├── security.js
│   │   └── startupValidation.js
│   ├── websocket/
│   │   ├── messageHandler.js
│   │   ├── security.js
│   │   └── server.js
│   ├── .env.example
│   ├── .gitignore
│   ├── app.js
│   └── package.json
├── database/
│   ├── functions.sql
│   ├── indexes.sql
│   └── schema-complete.sql
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── chat.css
│   │   ├── login.css
│   │   └── ym7.css
│   └── js/
│       ├── auth.js
│       ├── buddies.js
│       ├── chat.js
│       ├── search.js
│       ├── webrtc.js
│       └── ym7.js
└── scripts/
    └── setup-database.sh
