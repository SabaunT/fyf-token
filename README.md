# ethereum-contracts-template
Template for ethereum smart-contracts development

## Tests
For gas-cheap projects local truffle network can be used:
```
npx truffle test

# or with events
npx truffle test --show-events
```

If contract deployment requires much gas, use local ganache-network:
```
ganache-cli -p 7545 -i 5777 --allowUnlimitedContractSize  --gasLimit 0xFFFFFFFFFFFF
npx truffle migrate --reset --network development
npx truffle test --network development

# or with events
npx truffle test --show-events --network development
```

Make sure you have npx package installed globally.
