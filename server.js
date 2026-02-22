const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3666;  // 使用环境变量或默认3666端口

// ... existing code ... 