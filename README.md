# das-sdk

A library to resolve DAS accounts

## Install
```shell
npm install das-sdk
```

## Prerequisite
### Set up DAS Account Indexer
[das-account-indexer](https://github.com/DeAccountSystems/das-account-indexer) is the storage layer and API layer of DAS.

It read DAS data from CKB node and keep them locally.  

It provides a JSON-RPC, through which we can read DAS data in our business.

Please set up a [das-account-indexer](https://github.com/DeAccountSystems/das-account-indexer) on your own server and keep it running.

## Initialize
```javascript
import Das from 'das-sdk'

const das = new Das({
  url: 'https://{{endpoint.to.das.account.indexer}}',
})

das.records('dasloveckb.bit').then(console.log)
// ==>
// [{
//   key: 'address.eth',
//   label: 'coinbase',
//   value: '0x1234...4567',
//   ttl: 300,
//   avatar: 'https://identicons.da.systems/identicon/dasloveckb.bit'
// }, {
//   key: 'address.eth',
//   label: 'onchain',
//   value: '0x2345...6789',
//   ttl: 300,
//   avatar: 'https://identicons.da.systems/identicon/dasloveckb.bit'
// }]
```

## Configuration
To set up das-sdk, you need to provide `url`.  

- `url` is the JSON-RPC endpoint of [das-account-indexer](https://github.com/DeAccountSystems/das-account-indexer).

We suggest that developers run their own [das-account-indexer](https://github.com/DeAccountSystems/das-account-indexer).

> However, if you are new to DAS and want to test das-sdk, you can use this indexer run by DAS team as a start: `https://indexer-not-use-in-production-env.da.systems`. It provides both forward resolution and reverse record resolution.
> 
> But do remember that: do not use this in production environment.

> Meanwhile, we provide an official basic-indexer which only exposed some basic apis. 
> If you have trouble setting up an indexer, you can use this as an alternative.
> 
> `https://indexer-basic.da.systems`
> 
> You can use this indexer to use the following api:
> - das.account()
> - das.reverseRecord()



## Interfaces

```typescript
interface DasSource {
  url: string, // The Das indexer url
}

export interface AccountRecord {
  key: string, // The key of the record, in the form like `address.eth`, `profile.email`, 'custom_key.xx.yy`.
  label: string, // The label of the record. There may be multiple records for the same `key`, users can use `label` to distinguish them.  
  value: string, // The value of the record. Developers should valid the validity of the value before using them. 
  ttl: number, // Time to live for the record.

  avatar: string, // The DAS avatar generated by [identicons](https://github.com/DeAccountSystems/identicons)
}

export interface AccountInfo {
  account: string, // abc.bit
  avatar: string, // the das avatar
  
  account_id_hex: string, // 0x1234...
  next_account_id_hex: string, // 0x1234...
  create_at_unix: number, // seconds
  expired_at_unix: number, // seconds
  status: number, // 0
  das_lock_arg_hex: string,
  owner_algorithm_id: number, // 3: eth personal sign, 4: tron sign, 5: eip-712
  manager_algorithm_id: number,
  owner_key: string,
  manager_key: string
}

export interface KeyDescriptor {
  type: 'blockchain',
  key_info: {
    // The coin_type from https://github.com/satoshilabs/slips/blob/master/slip-0044.md
    // It currently support ETH/TRX/BNB/MATIC
    coin_type: string,
    // The chain_id from https://chainlist.org/
    // Used to identify different EVM-compatible chains such as ETH/BSC/MATIC
    chain_id?: string,
    key?: string
  }
}

// DAS API
class Das {
  constructor (source?: DasSource);

  // Returns the basic account info 
  account(account: string): Promise<AccountInfo>

  // Returns the record list for the given key of the DAS account
  // All records will return if the `key` is empty.
  records(account: string, key?: string): Promise<AccountRecord[]>

  // Get the reverse record of the given address
  reverseRecord(descriptor: KeyDescriptor): Promise<string>
}
```

> For more information, please see [get-reverse-record-info](https://github.com/DeAccountSystems/das-account-indexer/blob/main/API.md#get-reverse-record-info)

## API
### das.records(account: string, key?:string): Promise<AccountRecord[]>
Returns all the records for the given `key`.

All the records of the account will be returned If there is no `key` provided,

Empty list will be returned if there is no record for the `key`.

> Unlike ENS, DAS allows users to set multiple records for the same `key`, so the result will always be a list.

> Developers need to validate the validity of the result.

> All the supported keys can be found here: [record_key_namespace](https://github.com/DeAccountSystems/das-contracts/blob/4fdc1e09e484304d25c5965218a52bf9bf7bb7ce/tests/data/record_key_namespace.txt)

### das.account(account: string): Promise<AccountInfo>
Returns basic info of an account, including avatar, manager/owner address.

### das.reverseRecord(descriptor: KeyDescriptor): Promise<string>
Return the reverse record of the given address. For more information, pleas checkout [DAS Reverse Record](https://da.systems/reverse-record)

## Examples
Initialize using official indexer
```javascript
import Das from 'das-sdk'

const das = new Das({
  url: 'https://indexer-not-use-in-production-env.da.systems',
})
```

Get all records for the key `address.btc`
```javascript
das.records('dasloveckb.bit', 'address.btc').then(console.log)
// ==>
// [{
//   key: 'address.btc',
//   label: 'coinbase',
//   value: 'bc12345...xyz',
//   ttl: 300,
//   avatar: 'https://identicons.da.systems/identicon/dasloveckb.bit''
// }, {
//   key: 'address.btc',
//   label: 'onchain',
//   value: 'bc17890...zyx',
//   ttl: 300,
//   avatar: 'https://identicons.da.systems/identicon/dasloveckb.bit'
// }]

```

Get the reverse record of an address/key.
```javascript
das.reverseRecord({ 
  type: 'blockchain', 
  key_info: {
    coin_type: '714', // '714' for BNB
    chain_id: '56', // '56' for BSC
    key: '0x1d643fac9a463c9d544506006a6348c234da485f'
  }
}).then(console.log)
// => 'imac.bit'
```

Get account info of the account.
```javascript
das.account('dasloveckb.bit').then(console.log)
// ==>
// {
//   "account": "dasloveckb.bit",
//   avatar: 'https://identicons.da.systems/identicon/dasloveckb.bit',
//   "account_id_hex": "0x5f560ec1edc638d7dab7c7a1ca8c3b0f6ed1848b",
//   "next_account_id_hex": "0x5f5c20f6cd95388378771ca957ce665f084fe23b",
//   "create_at_unix": 1626955542,
//   "expired_at_unix": 1658491542,
//   "status": 1,
//   "das_lock_arg_hex": "0x0559724739940777947c56c4f2f2c9211cd5130fef0559724739940777947c56c4f2f2c9211cd5130fef",
//   "owner_algorithm_id": 5, // 3: eth personal sign, 4: tron sign, 5: eip-712
//   "owner_key": "0x59724739940777947c56c4f2f2c9211cd5130fef",
//   "manager_algorithm_id": 5,
//   "manager_key": "0x59724739940777947c56c4f2f2c9211cd5130fef"
// } 
```

Get an account that is not exist.
```javascript
das.account('adasaccountwithoutanymeaningswhichisnotexist.bit').catch(console.log)
// ==>
// ResolutionError {
//   code: 'UnregisteredAccount',
//     currencyTicker: undefined,
//     account: 'adasaccountwithoutanymeaningswhichisnotexist.bit',
//     method: undefined,
//     message: 'Account adasaccountwithoutanymeaningswhichisnotexist.bit is not registered',
// }
```

## Error Handling
Please checkout [./src/errors](./src/errors) for error descriptions.
