<template>
	<div class="tile is-6 is-parent">
		<article class="tile is-child notification is-info">
			<p class="title  is-5">Configuration</p>
			<div class="columns">
				<div class="column">
					<b-field label="Odex quote" :message="destination_quote_message">
						<b-input @input="onChange" v-model="configuration.destination_quote"  :disabled="!is_editing_allowed"></b-input>
					</b-field>
					<b-field label="Odex base" :message="destination_base_message">
						<b-input @input="onChange" v-model="configuration.destination_base"  :disabled="!is_editing_allowed"></b-input>
						</b-field>
					<b-field label="Owner address" :message="owner_address_message">
						<b-input @input="onChange" v-model="configuration.owner_address"  :disabled="!is_editing_allowed"></b-input>
					</b-field>
					<div>
						<a v-if="grantLink"  :href="grantLink" target="_blank">Grant</a>
						<a v-if="revokeLink" style="margin-left:20px;" :href="revokeLink" target="_blank">Revoke</a>
					</div>

					<b-field label="From" >
						<b-input @input="onChange" v-model="configuration.currency_0" :message="currency_0_message" :disabled="!is_editing_allowed"></b-input>
					</b-field>
					<b-field label="To" >
						<b-input @input="onChange" v-model="configuration.currency_1" :message="currency_1_message"  :disabled="!is_editing_allowed"></b-input>
					</b-field>
					<div v-if="show_currency_2">
						<b-field>
						<template slot="label">
						To<a style="margin-left:5px;" class="delete" @click="show_currency_2=false;configuration.currency_2='';onChange();"></a> 
							</template>
							<b-input @input="onChange" v-model="configuration.currency_2"  :message="currency_2_message"  :disabled="!is_editing_allowed"></b-input>
						</b-field>
					</div>
					<div>
						<b-button class="is-primary" v-if="!show_currency_2" @click="show_currency_2=true;">+</b-button>
					</div>
				</div>
				<div class="column">
					<b-field label="Quote balance minimum" >
						<b-numberinput @input="onChange" v-model="configuration.min_quote_balance"  :disabled="!is_editing_allowed" :min="0" :step="0.01"></b-numberinput>
					</b-field>
					<b-field label="Base balance minimum" >
						<b-numberinput @input="onChange" v-model="configuration.min_base_balance"  :disabled="!is_editing_allowed"  :min="0" :step="0.1"></b-numberinput>
					</b-field>
					<b-field label="Depth">
						<b-numberinput 
						@input="onChange"
						v-model="configuration.depth"  
						:disabled="!is_editing_allowed" 
						:min="1" 
						:max="100" 
						:step="1"
						/>
						</b-field>
					<b-field label="Min markup (in %)">
						<b-numberinput 
						@input="max_min_markup=configuration.max_markup;onChange()"
						v-model="configuration.min_markup"  
						:disabled="!is_editing_allowed" 
						:min="0" 
						:max="max_min_markup"
						:step="0.1"
						/>
					</b-field>
					<b-field label="Max markup (in %)">
						<b-numberinput 
						@input="min_max_markup=configuration.min_markup;onChange()"
						v-model="configuration.max_markup"  
						:disabled="!is_editing_allowed" 
						:min="min_max_markup" 
						:max="99"
						:step="0.1"
						/>
					</b-field>
				</div>
			</div>
		</article>
	</div>
</template>
<script>

const isUrl = require('is-url')
const { isValidAddress } = require('obyte/lib/utils');
import { aa_address, testnet_protocol, mainnet_protocol } from '../js/conf.js'

export default {
  props: {
		is_editing_allowed: Boolean,
		credentials: Object,
		connections: Object
	},
	data () {
		return {
			configuration: {
				dest_pair:'',
			},
			owner_address_message: '',
			destination_quote_message: '',
			destination_base_message: '',
			currency_0_message: '',
			currency_1_message: '',
			currency_2_message: '',
			min_max_markup: 0,
			max_min_markup: 0,
			show_currency_2: false,
			revokeLink: false,
			grantLink: false,
			arrSourceCurrencies: ['', '']
		}
	},
	computed: {

	},
	created() {
		this.configuration.owner_address = localStorage.getItem('owner_address') || ''
		this.configuration.min_quote_balance = Number(localStorage.getItem('min_quote_balance')) || 0.01
		this.configuration.min_base_balance  = Number(localStorage.getItem('min_base_balance')) || 0.1
		this.configuration.markup = Number(localStorage.getItem('markup')) || 2
		this.configuration.destination_quote = localStorage.getItem('destination_quote') || "USDC"
		this.configuration.destination_base = localStorage.getItem('destination_base') || "GBYTE"
		this.configuration.currency_0 = localStorage.getItem('currency_0') || "GBYTE"
		this.configuration.currency_1 = localStorage.getItem('currency_1') || "BTC"
		this.configuration.currency_2 = localStorage.getItem('currency_2') || "USD"
		this.configuration.min_markup = Number(localStorage.getItem('min_markup')) || 1
		this.configuration.max_markup = Number(localStorage.getItem('max_markup')) || 5
		this.configuration.depth = Number(localStorage.getItem('depth')) || 5

		this.min_max_markup = this.configuration.min_markup
		if(this.configuration.currency_2.length > 0)
			this.show_currency_2 = true;

		this.onChange()
	},
	watch:{
		credentials: function() {
			this.onChange()
		},
		connections: function() {
			this.onChange()
		},
	},
	methods:{
		saveConfiguration(){
			for (var key in this.configuration){
				localStorage.setItem(key, this.configuration[key]) 
			}
		},

		onChange(){
			var bComplete = true;
			if (!isValidAddress(this.configuration.owner_address)){
				this.owner_address_message = 'not valid'
				this.grantLink = false
				this.revokeLink = false
				bComplete = false
			}
			else {
				if (this.credentials.control_address && this.credentials.control_address.length > 0)
					this.createAuthorizeAndRevokeLinks()
				this.owner_address_message = ''
			}

			var checkFieldNotEmpty = (field)=>{
				if (!this.configuration[field].length){
					this[field+'_message'] = 'not valid'
					bComplete = false
				} else {
					this[field+'_message'] = ''
				}
			}

			checkFieldNotEmpty('destination_quote')
			checkFieldNotEmpty('destination_base')
			checkFieldNotEmpty('currency_0')
			checkFieldNotEmpty('currency_1')
			if (this.show_currency_2)
				checkFieldNotEmpty('currency_2')

			this.configuration.dest_pair = this.configuration.destination_base + '/' + this.configuration.destination_quote

			if (this.configuration.min_quote_balance === null || this.configuration.min_base_balance === null 
			|| this.configuration.min_markup === null || this.configuration.max_markup === null
			|| this.configuration.depth === null) 
				bComplete = false
			this.configuration.bComplete = bComplete
			if (bComplete)
				this.saveConfiguration();
			this.configuration.arrSourceCurrencies = this.arrSourceCurrencies
			this.$emit("onFormChange", this.configuration)
		},


		createAuthorizeAndRevokeLinks(){
			const base64url = require('base64url');
			var data = {
				grant: 1,
				address: this.credentials.control_address
			}
			var json_string = JSON.stringify(data);
			var base64data = base64url(json_string);
			this.grantLink = (this.connections.testnet ? testnet_protocol : mainnet_protocol)+":"+aa_address+"?amount=10000&base64data="+base64data;
			data = {
				revoke: 1,
				address: this.credentials.control_address
			}
			json_string = JSON.stringify(data);
			base64data = base64url(json_string);
			this.revokeLink = (this.connections.testnet ? testnet_protocol : mainnet_protocol)+":"+aa_address+"?amount=10000&base64data="+base64data;
		}
	}
}
</script>

