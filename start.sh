#!/bin/sh
nginx
cd /app && NODE_ENV=production node server.js
