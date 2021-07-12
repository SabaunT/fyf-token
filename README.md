# Frictionless yield farming token
Token which distributes fees, taken from transfers amounts, between all its holders. Smart contract works very much like 
[rfi.finance](https://github.com/reflectfinance) token, but concepts are more clear and implemented in secure manner.

## How it works?

### Distributing fees. The classic way - version 1
So the task sounds pretty simple: take a defined percent of fees from each transfer amount and increase all the balances the next
way: `balance = balance + fee * (balance/totalSupply)`. This consequently means that we should iterate over all the balances and
change them in the loop. That's about *O(n)*, where *n* is the amount of holders. Such function requires really lots of gas if amount
of holders goes really high, so we can face block gas limit restriction.

So is there any other more cheap way to do that?
### Distributing fees. Multiply on some *k*.
Well, another way to do that is to have some kind of `uint256 k` coefficient, could get us a new balance with earned fees like this:
`balance = balance * k`. Obviously, this coefficient is a decimal number. I think it's clear that in such case you should not iterate
over all the balances and apply the coefficient. You just use it when the request for the balance comes in (either `balanceOf` or any other
operation).

I should mention that researching details of this implementation and its pitfalls wasn't the aim of the project, so I continue by jumping
to the next part.

### Distributing fees. Divide on some *k*.
*Before going further, I should state that using `/` in the text lower is the same as floor division.*

This mechanism provided by [Ampleforth](https://github.com/ampleforth) developers. The project had a demand to "instantly" change holders balances in accordance
to price changes of the token. Pretty same task as we have. Here are some details how it works.

Instead of operation on balances stored in `mapping(address => uint256) private _balances` (further in the text - "standard" or "outer" balance) variable of *ERC20* token we introduce a new
dimension for the balances. Let's call it an **inner** balance. Inner type of balance has some correlation with the standard one. 
It's just the biggest multiple of the standard balance. Calculating its value is pretty easy in solidity:

1. So your maximum number is `uint256 constant MAX = type(uint256).max;`.
2. Sum of all balances is equal to `totalSupply`.
3. Sum of inner balances is equal to `innerTotalSupply` which is the biggest multiple of `totalSupply`. So it's value is
`uint256 constant innerTotalSupply = MAX - (MAX % totalSupply);`.
4. The coefficient `uint256 k = innerTotalSupply/totalSupply`. Further we will reference *k* by *rate*.

So the inner balance is just a dimension of the outer balance multiplied by the *rate*. Still it doesn't make clear how fees are distributed.

So in the project holder actually owns and manage his inner balance. Inner balances are changed only by transferring operations. When fees are taken they
are not distributed between holders by changing their inner balances. What is really changed is the representation of their inner balances - the outer balance.
Generally, outer balances are presented only when appropriate requests are done (i.e. `balanceOf()`) by returning `innerBalance/rate`. To make outer balance
bigger because of earned fees, we should simply make the *rate* lower in the provided earlier ratio. Making fee lower could be done by 2 ways: increasing `totalSupply`
or decreasing `innerTotalSupply`. Both increasing and decreasing are done by *fee* value. So the project uses the decreasing method: `rate = innerTotalSupply - fee*rate / totalSupply`.
Obviously, this operation makes "value" of inner balances higher in comparison to outer balances - for the same amount of outer total supply you
need less amount of inner supply and, consequently, the same amount of inner balance has a bigger outer representation.

Another way to do that could be just increasing the denominator value by the *fee*: `rate = innerTotalSupply/totalSupply + fee`. It means that the sum
of outer balances increased by *fee* value, so all the outer balances got their respected share of the *fee*, however the actual balance didn't change. So for the same
actual inner balance we get a bigger outer representation.

#### Example
Let's simplify getting a new outer balance like this:
```
1. newBalance = innerBalance / ((innerTotalSupply - rate*fee) / totalSupply)
innerTotalSupply = totalSupply*rate

2. newBalance = innerBalance / (rate * (totalSupply - fee) / totalSupply)
innerBalance = balance * rate

3. newBalance = (balance * rate) / (rate * (totalSupply - fee) / totalSupply)
4. newBalance = (balance * rate * totalSupply) / rate * (totalSupply - fee)
5. newBalance = (totalSupply * balance)/(totalSupply - fee)
```

And a simple test.

```python
# /usr/bin/python3

balance = 2327327472364723647
fee = 123832300
totalSupply = 1e24
balance1 = balance + balance*(fee/totalSupply)
balance2 = (balance*totalSupply)/(totalSupply-fee)
balance1 == balance2 # true
```   

#### Some things to mention
1. The maximum representation value of the outer balance was used for max granularity. Just the same as Ampleforth devs [did](https://github.com/ampleforth/uFragments/blob/master/contracts/UFragments.sol).
2. A smaller amount of decimals (9) was used for a more precision.
3. Sum of all balances doesn't equal to`totalSupply`, because the conversation between inner and outer has non-zero rounding error.
In practice the difference is about 1 or 2.
4. There is a possible bug with `innerTotalSupply` reaching such a small value, that the precision of balances calculation could be lost.
However, reaching that in practise is quite hard, because `innerTotalSupply` is a very big number. Still, a possible fix must be mentioned.
Firstly, while deploying the contract I suggest using proxy. Secondly, we can define some threshold value for the `innerTotalSupplt` after reaching
which we could "reinitialize" our `innerTotalSupply` by the initial value, which is the biggest multiple of `totalSupply` (`MAX - (MAX % totalSupply)`)
and recalculate balances in the next manner: `innerBalance = (innerBalance / rateBeforeInitialization) * rateAfterInitialization`, 
where `rateAfterInitialization` is `(MAX - (MAX % totalSupply)) / totalSupply`. The idea could be implemented in various ways.
5. Some projects want to have a burning with a fee distribution. The burning mechanism could be provided, but should be borne in mind that you can't burn total supply forever.
So burning mechanism should be stopped after reaching some threshold value. 

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

## TODO:
2. Посмотри, что делают проекты после деплоя. К примеру, они могут делать renounceOwnership и т.п. вещи делать. Посмотри на etherscan.