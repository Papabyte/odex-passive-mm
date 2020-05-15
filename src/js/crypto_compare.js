const EventEmitter = require('events').EventEmitter;
const WebSocket = window.WebSocket;

const conf = require('./conf.js');


var lastPrices = {};
var arrSourceCurrencies;

class WsEmitter extends EventEmitter {

	constructor() {
		super();
		this.ws = null;
	}


	connect(onDone) {

		let self = this;
		if (!onDone)
			return new Promise(resolve => this.connect(resolve));

		if (self.ws) {
			if (self.ws.readyState === self.ws.OPEN) {
				console.log("crypto compare ws already connected");
				return onDone();
			}
			if (!self.ws.done) {
				console.log("crypto compare ws already connecting");
				self.once('done', onDone);
				return;
			}
			console.log("crypto compare closing, will reopen");
		}
		console.log("will connect ws to " + conf.crypto_compare_ws_url );
		self.shouldClose = false;

		self.ws = new WebSocket(conf.crypto_compare_ws_url + '?api_key=' + conf.crypto_compare_api_key);

		self.ws.done = false;
		function finishConnection(_ws, err) {
			if (!_ws.done) {
				_ws.done = true;
				onDone(err);
				if (_ws)
					self.emit('done', err);
			}
		}

		let abandoned = false;
		let timeout = setTimeout(function () {
			abandoned = true;
			console.log("crypto compare ws abandonned");
			finishConnection(self.ws, 'timeout');
			self.ws = null;
		}, 5000);

		self.ws.onopen = function onWsOpen() {
			console.log('crypto compare ws opened');
			if (!self.ws || abandoned) {
				console.log("abandoned connection opened, will close");
				this.close();
				return;
			}
			clearTimeout(timeout);

			self.ws.last_ts = Date.now();
			console.log('connected');
			finishConnection(this);
			self.subscribe();
			self.emit('connected');
		};

		self.ws.onclose = function onWsClose() {
			console.log('crypto compare ws closed');
			clearTimeout(timeout);
			self.ws = null;
			if (self.shouldClose)
				return;
			setTimeout(self.connect.bind(self), 1000);
			finishConnection(this, 'closed');
			self.emit('disconnected');
		};

		self.ws.onerror = function onWsError(e) {
			console.log("on error from crypto compare WS server");
		};

		self.ws.onmessage = function (message) { // 'this' is set to ws
			self.onWebsocketMessage(this, message);
		};
	}


	onWebsocketMessage(_ws, message) {
		if (_ws.readyState !== _ws.OPEN)
			return console.log("received a message on crypto compare socket with ready state " + _ws.readyState);

		console.log(message.data);
		_ws.last_ts = Date.now();
		
		try {
			var objMessage = JSON.parse(message.data);

		}
		catch(e){
			return console.log('failed to json.parse message '+message.data);
		}

		console.log(arrSourceCurrencies)
		if (objMessage.TYPE == 5 && objMessage.PRICE){

			var index_0 = arrSourceCurrencies.indexOf(objMessage.FROMSYMBOL)
			if (index_0 == -1)
				throw Error("From Symbol not known " + objMessage.FROMSYMBOL);
			var index_1 = arrSourceCurrencies.indexOf(objMessage.TOSYMBOL)
				if (index_1  == -1)
				throw Error("To Symbol not known " + objMessage.TOSYMBOL);
				if ((index_1 - index_0) !== 1)
					throw Error("shift != 1");

				lastPrices[objMessage.FROMSYMBOL + '-' + objMessage.TOSYMBOL] = objMessage.PRICE;
				if (Object.keys(lastPrices).length === arrSourceCurrencies.length -1){
					var new_price;
					for (var key in lastPrices){
						new_price = !new_price ? lastPrices[key] : new_price * lastPrices[key];
					}
					console.log('new_price ' + new_price);
					this.emit('new_price', new_price);
				}

		}
	}

	isConnected() {
		return (this.ws && this.ws.readyState === this.ws.OPEN);
	}

	close() {
		this.shouldClose = true;
		this.ws.close();
	}

	send(message) {
		return new Promise(async (resolve)=>{
			let ws = this.ws;
			if (!ws || ws.readyState !== ws.OPEN) {
				let err = await this.connect();
				if (err)
					return resolve(err);
				ws = this.ws;
			}

			if (!ws)
				throw Error("no ws after connect");
			
			if (typeof message === 'object')
				message = JSON.stringify(message);

			try {
				ws.send(message); // it can fail even if readyState was on OPEN
			} catch (e) {
				console.log('failed send ' + e.toString());
				return setTimeout(async ()=>{
					await this.send(message);
					resolve();
				}, 500)
			}
			resolve();
		});
	}

	async subscribe() {
		const subs = [];

		arrSourceCurrencies = [conf.currency_0, conf.currency_1];
		if ( conf.currency_2 &&  conf.currency_2.length > 0)
			arrSourceCurrencies.push(conf.currency_2);

		for (var i=0; i< arrSourceCurrencies.length -1; i++)
			subs.push('5~CCCAGG~'+ arrSourceCurrencies[i] + '~' + arrSourceCurrencies[i +1])

		const message = {
			"action": "SubAdd",
			"subs": subs
	};
		return await this.send(message);
	}

}

module.exports = new WsEmitter();
