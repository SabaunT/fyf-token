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

## Dev notes:
1. Имей в виду комментарии, которые были даны в Certik + https://pera.finance/info/PeraSmartContractAuditReport.pdf.
2. Имей в виду багу и ее исправление в части excluded и included аккаунтов. Воспользуйся исправлением, предложенным тут: https://perafinance.medium.com/safemoon-is-it-safe-though-a-detailed-explanation-of-frictionless-yield-bug-338710649846
3. Посмотри, что делают проекты после деплоя. К примеру, они могут делать renounceOwnership и т.п. вещи делать. Посмотри на etherscan. 
4. Выбери между комиссией 2% и burn. Есть сомнения по поводу bunr функции: надо проверить, что произойдет при exclude, потому что в этом случае мы можем получить токен саплай ниже, чем количество токенов у людей в маппинге тОунд. Насколько же это опасно? Можем поломать инвариант?
5. Ответь на оставшиеся вопросы.
* are there any reasons to make decimals = 9, not 18?
* what is the aim of the exclude list? Is it to exclude exchanges, because of some bugs with them? It seems I can wipe off the exclude list logic.
* отличие тотал supply от суммы балансов на 1-2
* какая математика такая лежит под rTotal... Приведение в соответствие классического метода и RFI
* почему не работает с uint16?
6. Проверь безопасность approve для контрактов
7. Style improvement - make a different erc20 contract with all the required logic, then inherit it with some changes for the RFI mechanics.
8. Change names after getting into deepply into the context of the protocol