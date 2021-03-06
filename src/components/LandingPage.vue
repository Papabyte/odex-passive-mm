<template>
<div>
	<div class="tile is-ancestor">
		<div class="tile is-parent is-3 is-vertical">
		<connections 
			:is_editing_allowed="!is_started && !is_starting" 
			@onFormChange="updateConnections($event)"
		/>
		<credentials 
			:is_editing_allowed="!is_started && !is_starting" 
			:connections="connections" 
			@onFormChange="updateCredentials($event)"
		/>
	</div>
		<configuration 
			:is_editing_allowed="!is_started && !is_starting" 
			:credentials="credentials"
			:connections="connections" 
			@onFormChange="updateConfiguration($event)
		"/>
			<status 
			:credentials="credentials" 
			:connections="connections"
			:is_started="is_started" 
			:pairTokens="pairTokens"
			:configuration="configuration"
			@start="start"
			@stop="stop"
			:isStarting="is_starting"
		/>
	</div>
	<div class="tile is-ancestor">
		<orders
			:configuration="configuration"
			:pairTokens="pairTokens"
		/>
		<trades/>
		</div>
	</div>

</template>

<script>

const trade = require('../js/trade.js');
import Credentials from './Credentials.vue'
import Connections from './Connections.vue'
import Configuration from './Configuration.vue'
import Orders from './Orders.vue'
import Trades from './Trades.vue'

import { EventBus } from '../js/event-bus.js';

import Status from './Status.vue'


export default {
	components: {
		Credentials,
		Connections,
		Configuration,
		Status,
		Orders,
		Trades
	},
	data () {
		return {
			is_started: false,
			is_starting: false,
			credentials: {},
			connections: {},
			configuration: {},
			orders: {},
			pairTokens: [],
		}
	},
	created() {
		EventBus.$on('error', (err)=>{
			this.popToast(err, true)
		})

		EventBus.$on('first_price', (price, dest_pair)=>{
			this.$buefy.dialog.confirm({
				message: 'Place orders on <a href="'+ this.connections.odex_http_url.replace('/api', '')+ '/' + dest_pair + '" target="_blank">' 
				+ dest_pair +'</a> with a base price of ' + price.toPrecision(5)+'?',
				onConfirm: () => {
					trade.validateFirstPrice(price, dest_pair)
				},
				onCancel: this.stop
			})
		})

		window.onbeforeunload = async (event)=>{ // event triggered on browser exit
			if(this.is_started)
				await this.stop();
		}
	},
	methods:{
		async start(){
			if (!this.configuration.bComplete)
				return this.popToast('Configuration is not complete')
			if (!this.credentials.bComplete)
				return this.popToast('Credentials are not complete')
			if (!this.connections.bComplete)
				return this.popToast('Connections are not complete')
			this.is_starting = true;
			trade.start(
				Object.assign({}, this.credentials, this.connections,  this.configuration),
				EventBus
				).then((pairTokens)=>{
					this.pairTokens = pairTokens
					this.is_started = true
					this.is_starting = false
				}).catch(
					(e)=>{
						this.popToast(e)
						this.is_starting = false
				})

		},
		async stop(){
			try{
				await trade.stop()
			} catch(e){
				this.popToast(e.toString())
			}
			this.is_started = false

		},
		updateCredentials: function(credentials){
			this.credentials = Object.assign({}, credentials) // we clone in a new object so watchers can see the change
		},
		updateConnections: function(connections){
			this.connections = Object.assign({}, connections) 
		},
		updateConfiguration: function(configuration){
			this.configuration = Object.assign({}, configuration) 
		},
		popToast: function(message, bDontQueue){
			this.$buefy.toast.open({
				duration: 5000,
				message,
				queue: !bDontQueue,
				position: 'is-bottom',
				type: 'is-danger'
			})
		}
	}
}
</script>

