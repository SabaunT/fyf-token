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
2. Посмотри, что делают проекты после деплоя. К примеру, они могут делать renounceOwnership и т.п. вещи делать. Посмотри на etherscan. 
3. Выбери между комиссией 2% и burn.
Есть сомнения по поводу bunr функции: надо проверить, что произойдет при exclude,
потому что в этом случае мы можем получить токен саплай ниже, чем количество токенов у людей в маппинге тОунд. Насколько же это опасно? Можем поломать инвариант?
4. Ответь на оставшиеся вопросы.
* what is the aim of the exclude list? Is it to exclude exchanges, because of some bugs with them? It seems I can wipe off the exclude list logic.
* отличие тотал supply от суммы балансов на 1-2
* какая математика такая лежит под rTotal...
5. Change names after getting into deepply into the context of the protocol
6. reflectTotalSupply lower bound (https://github.com/reflectfinance/reflect-contracts/issues/10). Seems that mechanics should be off after some time. Есть бага, которая связана с границами rTotal. Из-за того, что rTotal постоянно уменьшается
мы можем прийти к ситуации, когда начисления комиссий поломаются. В этом случае, при достижении
определенного threshold необходимо осуществить занового инициализацию контракта так.
6.1. Когда контракт создан, у нас имеется множество балансов balances, которые имеют свои соответствующие
представление в reflected области - reflectedBalances. Это представление делается по самому большому возможному коэффициенту.
свое представление в r балансах просто умноженным на максимально возможный коэффициент (rTotal/tTotal).
6.2. Заметь, что здесь вообще не имеет значения, какие у вас балансы токенов balances. Самое главное, что они помножены на максимальный рейт.
6.3. Когда рэйт становится все меньше и меньше вследствие уменьшения rTotal, мы должны обновить rTotal, чтобы продолжить начисления
токенов. Однако если мы его единомоментно обновим, то получится так, что балансы потеряют все свои комиссии.
6.4. Чтобы былансы не теряли свои комиссии, надо чтобы эти балансы (с комиссиями) стали новыми инициализированными состояниями
балансов при максимальном рейте как в 6.1 и 6.2. Для этого можно сделать так reflectedBalance = (reflectedBalance/rateBeforeReinitialization) * newMaxRate.
Другими словами можно просто отслеживать на какую величину мы должны делить и умножать reflectedBalance. Количество делений и умножений
показывает количество реинициализаций rTotal.
6.5. Реализация этого может отличаться.