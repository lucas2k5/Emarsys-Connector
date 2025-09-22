const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const redact = (obj) => {
	const SENSITIVE = ['password','token','authorization','cpf','card','cvv'];
	const MAX_LEN = 2000;
	const clone = JSON.parse(JSON.stringify(obj || {}));
	(function walk(o){
		for (const k of Object.keys(o)) {
			if (SENSITIVE.includes(String(k).toLowerCase())) o[k] = '[REDACTED]';
			else if (o[k] && typeof o[k] === 'object') walk(o[k]);
			else if (typeof o[k] === 'string' && o[k].length > MAX_LEN) o[k] = o[k].slice(0, MAX_LEN)+'…';
		}
	})(clone);
	return clone;
};

const httpLoggerWinston = winston.createLogger({
	level: process.env.LOG_LEVEL || 'info',
	format: winston.format.json(),
	transports: [
		new DailyRotateFile({
			dirname: logsDir,
			filename: 'http-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			maxFiles: '14d',
			zippedArchive: true,
		}),
		new winston.transports.Console({ format: winston.format.json() }),
	],
});

const httpLogger = (req, res, next) => {
	const start = process.hrtime.bigint();
	const safeBody = redact(req.body);
	const safeQuery = redact(req.query);

	const base = {
		ts: new Date().toISOString(),
		service: process.env.SERVICE_NAME || 'emarsys-server',
		env: process.env.NODE_ENV || 'development',
		method: req.method,
		route: req.route?.path || req.path,
		path: req.originalUrl || req.url,
		request_id: req.headers['x-request-id'] || null,
	};

	res.on('finish', () => {
		const latency_ms = Number((process.hrtime.bigint() - start) / 1000000n);
		const status = res.statusCode;

		const record = {
			...base,
			level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
			msg: `HTTP ${status}`,
			status_code: status,
			latency_ms,
			payload: status >= 400 ? { body: safeBody, query: safeQuery } : undefined,
			err: res.locals?.error || undefined,
		};

		const SAMPLE_2XX = Number(process.env.LOG_SAMPLE_2XX || 20);
		const shouldLog = status >= 400 || Math.floor(Math.random() * SAMPLE_2XX) === 0;
		if (shouldLog) httpLoggerWinston.log(record.level, record);
	});

	next();
};

module.exports = { httpLogger };


