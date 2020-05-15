/*jslint node: true */
'use strict';
const odex = require('odex-client-browser');
const conf = require("./conf");
const mutex = require("./mutex.js");

let orders, ws_api, balances, exchange;
let crypto_compare;

let arrBids = [];
let arrAsks = [];
let assocOrdersToBeCancelled = {};
let assocCheckCancellingTimerIds = {};
let bExiting = false;
let bStarted = false;
let vueEventBus;
let lastPrice;

function getDestOrderByHash(hash) {
	for (var i=0; i < arrBids.length; i++){
		if (arrBids[i] && arrBids[i].hash == hash)
			return arrBids[i];
	}
	for (var i=0; i < arrBids.length; i++){
		if (arrAsks[i] && arrAsks[i].hash == hash)
			return arrAsks[i];
	}
	return null;
}

async function cancelAllTrackedDestOrders() {
	console.log("will cancel all tracked orders");
	for (var i=0; i < arrBids.length; i++){
		if (arrBids[i])
			cancelOrderAndCheckLater(arrBids[i].hash);
	}
	for (var i=0; i < arrAsks.length; i++){
		if (arrAsks[i])
			cancelOrderAndCheckLater(arrAsks[i].hash);
	}
}

async function cancelAllDestOrders() {
	console.log("will cancel " + Object.keys(orders.assocMyOrders).length + " dest orders");
	for (let hash in orders.assocMyOrders){
		await cancelOrderAndCheckLater(hash);
	}
}


async function updateDestBids(new_price) {
	let unlock = await mutex.lock('bids');
	let dest_balances = await balances.getBalances();
	vueEventBus.$emit('dest_balances', dest_balances);
	console.error('dest balances', dest_balances);

	let { matcherFee } = exchange.getFees(conf.destination_quote);
	let tokensBysymbols = exchange.getTokensBySymbol();
	let quoteDecimals = tokensBysymbols[conf.destination_quote].decimals;
	let dest_quote_balance_available = (dest_balances[conf.destination_quote] * (1 - matcherFee) || 0) / (10 ** quoteDecimals) - conf.min_quote_balance;
	if (conf.destination_quote == 'GBYTE')
		dest_quote_balance_available -= 0.00001

	let bDepleted = (dest_quote_balance_available <= 0);
	if (arrBids[0])
		await cancelOrderAndCheckLater(arrBids[0].hash);

	let size = (dest_quote_balance_available / new_price) / conf.depth;

	for (let i = 0; i < conf.depth; i++){
		if (arrBids[i + 1])
			await cancelOrderAndCheckLater(arrBids[i + 1].hash);

		if (bDepleted) { 
			arrBids[i] = null;
			continue;
		}
		let price = new_price * (1 - (conf.min_markup + (conf.max_markup - conf.min_markup ) * i / conf.depth) / 100);
		let dest_quote_amount_required = size * price;
		if (dest_quote_amount_required > dest_quote_balance_available) {
			bDepleted = true;
			console.log("bid #" + i + ": " + size + " GB at " + price + " requires " + dest_quote_amount_required + " BTC on dest but have only " + dest_quote_balance_available + " BTC available on dest");
			dest_quote_amount_required = dest_quote_balance_available;
			size = dest_quote_amount_required / price;
		}

		if (size >= conf.MIN_DEST_ORDER_SIZE) {
			dest_quote_balance_available -= dest_quote_amount_required;
			console.log("BUY " +size + " " + price);

			let hash = await orders.createAndSendOrder(conf.dest_pair, 'BUY', size, price);
			if (hash) {
				console.log("sent order " + hash);
				arrBids[i] = { hash, size, price };
			}
		}
		else {
			console.log("skipping bid " + size + " GB at " + price + " as it is too small");
			arrBids[i] = null;
		}
	}

	unlock();
}


async function updateDestAsk(new_price) {
	let unlock = await mutex.lock('asks');
	let dest_balances = await balances.getBalances();
	vueEventBus.$emit('dest_balances', dest_balances);
	console.error('dest balances', dest_balances);
	let tokensBysymbols = exchange.getTokensBySymbol();
	let baseDecimals = tokensBysymbols[conf.destination_base].decimals;
	console.log("baseDecimals " + baseDecimals);

	let dest_base_balance_available = ((dest_balances[conf.destination_base] || 0))/(10 **baseDecimals)- conf.min_base_balance;
	if (conf.destination_base == 'GBYTE')
		dest_base_balance_available -= 0.00001

	let bDepleted = (dest_base_balance_available <= 0);
	if(arrAsks[0])
		await cancelOrderAndCheckLater(arrAsks[0].hash);

	let size = dest_base_balance_available / conf.depth;

	for (let i = 0; i < conf.depth; i++){
		if (arrAsks[i + 1])
			await cancelOrderAndCheckLater(arrAsks[i + 1].hash);

		if (bDepleted) { 
			arrAsks[i] = null;
			continue;
		}
		let price = new_price * (1 + (conf.min_markup + (conf.max_markup - conf.min_markup ) * i / conf.depth) / 100);

		if (size > dest_base_balance_available) {
			bDepleted = true;
			console.log("bid #" + i + ": " + size+  ", only " + dest_base_balance_available + "available");
			size = dest_base_balance_available;
		}

		if (size >= conf.MIN_DEST_ORDER_SIZE) {
			dest_base_balance_available -= size;
			console.log("SELL " +size + " " + price);
			let hash = await orders.createAndSendOrder(conf.dest_pair, 'SELL', size, price);
			if (hash) {
				console.log("sent order " + hash);
				arrAsks[i] = { hash, size, price };
			}
		}
		else {
			arrAsks[i] = null;
			console.log("skipping asks " + size + " GB at " + price + " as it is too small");
		}

	}
	unlock();
}



let onResetOrdersSet = false;

async function onDestDisconnect() {
	vueEventBus.$emit('onDestDisconnect');
	if (onResetOrdersSet){
		return console.log('onResetOrdersSet already set')
	}
	console.log("will cancel all dest orders after disconnect");

	ws_api.once('reset_orders', onResetOrders);
	onResetOrdersSet = true;
	async function onResetOrders(){
		console.log("reset_orders: will cancel all my dest orders after reconnect");
		await cancelAllTrackedDestOrders(); // this will be actually executed after reconnect
		console.log("done cancelling all my dest orders after reconnect");
		await ws_api.subscribeOrdersAndTrades(conf.dest_pair);
		console.log("done updating dest orders after reconnect");
		onResetOrdersSet = false;
		lastPrice = null;
		unlock();
	}

	let unlock = await mutex.lock('update');
	console.log("got lock to cancel all dest orders after disconnect");
}


async function onDestTrade(matches) {
	console.log("dest trade", JSON.stringify(matches, null, '\t'));
	let size = 0;
	let averagePrice;
	let side;
	let role;

	for (let i = 0; i < matches.trades.length; i++){
		let trade = matches.trades[i];
		let dest_order = getDestOrderByHash(trade.makerOrderHash);
		if (dest_order) {
			if (role && role !== 'maker')
				throw Error("self-trade?");
			if (dest_order.filled)
				continue;
			role = 'maker';
			side = matches.makerOrders[i].side;
			dest_order.filled = true;
		}
		else {
			dest_order = getDestOrderByHash(trade.takerOrderHash);
			if (dest_order) {
				if (role && role !== 'taker')
					throw Error("self-trade?");
				if (dest_order.filled)
					continue;
				role = 'taker';
				side = matches.takerOrder.side;
				dest_order.filled = true;
			}
		}
		if (dest_order) {
			let price = parseFloat(dest_order.price);
			if (!averagePrice)
				averagePrice = price;
			else
				averagePrice = (averagePrice * size + trade.amount * price) / (averagePrice * size);
			size += trade.amount;

		}
	}
	if (size && !side)
		throw Error("no side");
	if (size) {
		size /= 1e9;
		console.log("detected fill of my " + side + " " + size + " GB on dest exchange at average price " + averagePrice + ", will do the opposite on source exchange");
		vueEventBus.$emit('trade', {
			type: 'dest',
			side,
			size,
			price: averagePrice,
			time: new Date()
		});
	}
	else
		console.log("no my orders or duplicate");
}



function refreshDashboardOrdersOnNextick(){ // update orderbook on user dashboard
	setTimeout(function(){
		vueEventBus.$emit('orders_updated', orders.assocMyOrders);
	}, 0);
}

async function onNewPrice(new_price){

	if (!lastPrice || new_price < lastPrice * 0.999) {
		await updateDestBids(new_price);
		await updateDestAsk(new_price);
	} else if (new_price > lastPrice * 1.001){
		await updateDestAsk(new_price);
		await updateDestBids(new_price);
	}
	lastPrice = new_price;
}


function start(_conf, _vueEventBus) {
	return new Promise(async (resolve, reject)=>{
		if (bStarted){
			return reject('already started');
		}
		bStarted = true;

		Object.assign(conf, _conf);
		vueEventBus = _vueEventBus;

		try {
			await odex.start(conf);
			orders = odex.orders;
			ws_api = odex.ws_api;
			balances = odex.balances;
			exchange= odex.exchange;
			await orders.trackMyOrders();
		} catch(e){
			bStarted = false;
			return reject("Coudln't start Odex client: " + e.toString());
		}

		try {
			var pairTokens = await exchange.getTokensByPair(conf.dest_pair);
		} catch(e){
			odex.stop();
			bStarted = false;
			return reject(conf.dest_pair + " doesn't exist on Odex");
		}

		cancelAllDestOrders();

		initWsApiEvents();

		await ws_api.subscribeOrdersAndTrades(conf.dest_pair);
		assocOrdersToBeCancelled = {};
		lastPrice = null;
		crypto_compare = require('./crypto_compare.js')
		crypto_compare.connect();
		crypto_compare.on('new_price', onNewPrice)

		resolve(pairTokens);

	})
}


async function stop(){
	return new Promise(async (resolve, reject)=>{
		if (bExiting)
			return reject('Already stopping');
		if (!bStarted)
			return reject('Not started');
		bExiting = true;
		lastPrice = 0;
		crypto_compare.close();
		crypto_compare.removeAllListeners();
		await cancelAllTrackedDestOrders();

		setTimeout(function(){
			const nonCancelledOrdersLength = Object.keys(assocOrdersToBeCancelled).length;
			if (nonCancelledOrdersLength > 0)
				vueEventBus.$emit('error', nonCancelledOrdersLength + " Odex order" + (nonCancelledOrdersLength > 1 ? "s weren't" : " wasn't") + " cancelled on exit");
			refreshDashboardOrdersOnNextick();
			odex.stop();
			for (var key in assocCheckCancellingTimerIds){
				clearTimeout(key);
			}
			bExiting = false;
			bStarted = false;
			resolve()
		}, 2000)
	})
}

function initWsApiEvents(){

// these events are unlistened when odex.stop() is called
	ws_api.on('trades', (type, payload) => {
//	console.error('---- received trades', type, payload);
	});
	ws_api.on('orderbook', (type, {asks, bids}) => {
//		console.error('---- received orderbook', type, asks, bids);
	});
	ws_api.on('ohlcv', (type, payload) => {
//	console.error('---- received ohlcv', type, payload);
	});
	ws_api.on('orders', async (type, payload) => {
		console.error('---- received orders', type, payload);
		refreshDashboardOrdersOnNextick();
		if (type === 'ORDER_CANCELLED'){
			delete assocOrdersToBeCancelled[payload.hash];
		}
//	else if (type === 'ORDER_ADDED')
//		console.log("order " + payload.hash + " at " + payload.price + " added with status " + payload.status);
		else if (type === 'ERROR') {
			if (payload.match(/Cannot cancel order .+\. Status is FILLED/))
				return console.error("attempting to cancel a filled order");
			if (payload.match(/Cannot cancel order .+\. Status is CANCELLED/)){
				const hash = payload.replace("Cannot cancel order ", "").replace(". Status is CANCELLED", "");
				delete assocOrdersToBeCancelled[hash]; // don't try to cancel it again
				return console.error("attempting to cancel cancelled order " + hash);
			}
			if (payload.match(/failed to find the order to be cancelled/))
				return console.error("attempting to cancel a non-existent order");
			console.error('latest dest balances', await balances.getBalances());

			let matches = payload.match(/^Insufficient.+for order (.*) at/);
			if (matches) {
				var hash_to_remove = matches[1];
				delete assocOrdersToBeCancelled[hash_to_remove];
			}
		}
	});
	ws_api.on('raw_orderbook', (type, payload) => {
	//	console.error('---- received raw_orderbook', type, payload);
	});
	ws_api.on('orders', (type, payload) => {
		if (type === 'ORDER_MATCHED'){
	//	console.error('---- received matches', type, payload.matches);
			onDestTrade(payload.matches);
		}
	});
	ws_api.on('disconnected', onDestDisconnect);

}

async function cancelOrderAndCheckLater(hash, timerId){

	function setCheckingCallback(){
			var nextTimerId = setTimeout(function(){
				cancelOrderAndCheckLater(hash, nextTimerId);
			}, 20000);
			assocCheckCancellingTimerIds[nextTimerId] = true;
	}
	if (!timerId){
		if (assocOrdersToBeCancelled[hash])
			return console.log("cancelling already requested for " + hash);
		else
			assocOrdersToBeCancelled[hash] = true;
		console.log("send cancel " +hash )
					await orders.createAndSendCancel(hash);
		setCheckingCallback();
	} else {
		delete assocCheckCancellingTimerIds[timerId];
		if (assocOrdersToBeCancelled[hash] && orders.assocMyOrders[hash]){ // if it's not in assocMyOrders, it never was actually added
			vueEventBus.$emit('error', hash + " wasn't cancelled");
			await orders.createAndSendCancel(hash);
			setCheckingCallback();
		} else {
			delete assocOrdersToBeCancelled[hash];
			console.log("cancelling order " + hash + " was confirmed by Odex");
		}
	}
}


exports.start = start;
exports.stop = stop;