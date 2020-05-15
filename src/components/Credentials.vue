<template>
	<div class="tile is-child">
		<article class="tile is-child notification is-info">
			<p class="title is-5">Credentials</p>
			<b-field :message="wif_message">
				<template slot="label">
					wif
					<b-tooltip type="is-dark" label="Private key for your control address, can be generated on https://bonustrack.github.io/obyte-paperwallet/">
					<b-icon size="is-small" icon="help-circle-outline"></b-icon>
					</b-tooltip>
				</template>
				<b-input @input="onChange" v-model="credentials.wif" type="password" autocomplete="off" :disabled="!is_editing_allowed || are_credentials_saved"></b-input>
			</b-field>
			<b-field :message="api_key_message">
				<template slot="label">
					Crypto compare API key
					<b-tooltip type="is-dark" label="Free personal API key from cryptocompare.com">
					<b-icon size="is-small" icon="help-circle-outline"></b-icon>
					</b-tooltip>
				</template>
				<b-input @input="onChange" v-model="credentials.crypto_compare_api_key" type="password" :disabled="!is_editing_allowed || are_credentials_saved" autocomplete="off"></b-input>
			</b-field>
			<b-button class="is-primary" v-if="is_editing_allowed && are_credentials_saved" @click="deleteCredentials">Delete from computer</b-button>				
			<b-button class="is-primary" v-if="is_editing_allowed && !are_credentials_saved && is_form_complete" @click="saveCredentials">Save on computer</b-button>
		</article>
	</div>
</template>

<script>
const { fromWif, getChash160 } = require('obyte/lib/utils');
const ecdsa = require('secp256k1');

export default {
  props: {
		is_editing_allowed: Boolean,
		connections: Object
	},
	data () {
			return {
				is_form_complete: false,
				are_credentials_saved: false,
				wif_message: '',
				api_key_message: '',
				api_secret_message: '',
				credentials: {}
			}
		},
	created() {
		this.are_credentials_saved = !!localStorage.getItem('wif') && !!localStorage.getItem('crypto_compare_api_key')
		this.credentials.wif = localStorage.getItem('wif') || ''
		this.credentials.crypto_compare_api_key = localStorage.getItem('crypto_compare_api_key') || ''
		this.onChange()
	},
		watch:{

		connections: function() {
		this.onChange()
		}
		 
	},
	methods:{
		deleteCredentials(){
			for (var key in this.credentials){
				localStorage.removeItem(key)
				this.credentials[key] = ''
			}
			this.are_credentials_saved = false
		},
		saveCredentials(){
			for (var key in this.credentials){
				localStorage.setItem(key, this.credentials[key]) 
			}
			this.are_credentials_saved = true
		},
		onChange(){
			var bComplete = true;
			if (this.credentials.wif.length == 0){
				this.wif_message = 'not valid'
				this.credentials.control_address = ''
				bComplete = false
			} else {
				var privateKey;
				try {
					privateKey = fromWif(this.credentials.wif, this.connections.testnet).privateKey;
				} catch (e){
					this.wif_message = e.toString()
					this.credentials.control_address = ''
					bComplete = false
				}
				if (bComplete){
					const definition = ['sig', { pubkey: ecdsa.publicKeyCreate(privateKey).toString('base64')}];
					this.wif_message = ''
					this.credentials.control_address = getChash160(definition);
				}
			}

			if (this.credentials.crypto_compare_api_key.length !=64){
				this.api_key_message = 'not valid'
				bComplete = false
			}
			else {
				this.api_key_message = ''
			}

			this.credentials.bComplete = this.is_form_complete = bComplete
			this.$emit("onFormChange", this.credentials)
		}
	}
}
</script>

