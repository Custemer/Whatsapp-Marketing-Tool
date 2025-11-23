const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Campaign = require("../models/Campaign");
const { getWhatsAppClient } = require("./pair");

const router = express.Router();

// Configure multer for campaign images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './uploads/campaigns';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req
