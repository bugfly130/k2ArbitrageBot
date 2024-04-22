const dotenv = require("dotenv");
const BigNumber = require("bignumber.js");
const Web3 = require("web3");
const ethers = require('ethers');
const fs = require("fs");
const { doFlashArbitrage } = require("./flashBot");
const { doNormalArbitrage } = require("./normalBot");

//ABI
const config = require("./config.json");
const erc20ABI = require("./abi/erc20.json");
const routerABI = require("./abi/router.json");
const factoryABI = require("./abi/factory.json");
const pairABI = require("./abi/pair.json");

//setting
const router_paths = require("../router_paths.json")
const setting = require("../setting.json");
let stop = false;

dotenv.config();

const exchanges = config.exchange;
const tokens = config.token;

const web3 = new Web3(config.RPC_URL);

const getReadableAmount = (amountInWei, decimals) => {
    const bn = new BigNumber(amountInWei + "e-" + decimals);
    return Number(bn.toString());
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getCurrentGasPrices = async () => {
    try {
        //this URL is for Ethereum mainnet and Ethereum testnets
        let GAS_STATION = `https://api.debank.com/chain/gas_price_dict_v2?chain=bsc`;
        var response = await axios.get(GAS_STATION);
        var prices = {
            low: Math.floor(response.data.data.slow.price),
            medium: Math.floor(response.data.data.normal.price),
            high: Math.floor(response.data.data.fast.price),
        };
        printLog(`Gas price is ${prices}`);
        return prices;
    } catch (error) {
        //console.log(error);
        const price = await web3.eth.getGasPrice();
        return {
            low: price,
            medium: price,
            high: price
        };
    }
};

const runBot = async () => {
    // const { myAccount } = web3.eth.accounts.privateKeyToAccount(process.env.PRIV_KEY);

    const routers = {};

    for (const exchange of Object.values(exchanges)) {//get factory and router contracts
        // routers.push({ [exchange]: new web3.eth.Contract(routerABI, exchange) });
        routers[exchange] = new web3.eth.Contract(routerABI, exchange);
    }

    const amount = setting['amount'];
    let max_arbitrage = 0;
    let path_id = 0;
    while (true) {
        for (const router_path of router_paths) {
            var i = router_paths.indexOf(router_path);
            // console.log(router_path);
            // console.log(i, router_path.description);
            try {
                const amountIn = await routers[router_path.addr_from].methods.getAmountsIn(parseInt(ethers.utils.parseUnits(amount.toString(10), router_path.decimal1) * router_path.price).toString(), [router_path.token0, router_path.token1]).call();
                const from_swap = ethers.utils.formatUnits(amountIn[0], router_path.decimal0);

                // console.log(parseInt(ethers.utils.parseUnits(amount.toString(10), router_path.decimal1) * router_path.price).toString(), [router_path.token1, router_path.token2]);
                const amountOut = await routers[router_path.addr_to1].methods.getAmountsOut(parseInt(ethers.utils.parseUnits(amount.toString(10), router_path.decimal1) * router_path.price).toString(), [router_path.token1, router_path.token2]).call();
                const to_swap1 = ethers.utils.formatUnits(amountOut[1], router_path.decimal2);

                // console.log(ethers.utils.parseUnits(to_swap1.toString(), router_path.decimal2).toString(), [router_path.token2, router_path.token0]);
                const amountOut_ = await routers[router_path.addr_to2].methods.getAmountsOut(ethers.utils.parseUnits(to_swap1.toString(), router_path.decimal2).toString(), [router_path.token2, router_path.token0]).call();
                const to_swap2 = ethers.utils.formatUnits(amountOut_[1], router_path.decimal0);

                const arbitrage = to_swap2 - from_swap;
                if (max_arbitrage < arbitrage) {
                    max_arbitrage = arbitrage;
                    path_id = i;

                }
                console.log(router_path.description, max_arbitrage, arbitrage, from_swap, to_swap1, to_swap2);

            } catch (err) {
                // console.log(err);
            }

            // await sleep(1000);
        }

        const shouldTrade = max_arbitrage >= setting['profit'];
        console.log("-------------------~-~------------------")
        if (!shouldTrade) continue;
        const router_path = router_paths[i];

        console.log("-------------------------------------------------------------------------------------------------------------------------------------");
        console.log(`Borrow ${router_path.token1} Amount:`, setting['amount'] * router_path.price + ` from ${router_path.addr_from}`);
        console.log(`swap ${router_path.token1} Amount:`, setting['amount'] * router_path.price + ` to ${router_path.addr_to1}`);
        console.log(`swap ${router_path.token2} Amount:`, to_swap1 + ` to ${router_path.addr_to2}`);
        console.log(`Got ${router_path.token0} Amount:`, to_swap2 - from_swap);
        console.log(`Expected profit : ` + arbitrage);
        console.log(`PROFITABLE? ${shouldTrade}`);
        const gasPrice = await getCurrentGasPrices();

        const tx = await routers[router_path.addr_from].swap(ethers.utils.parseUnits((amount * router_path.price).toString(), router_path.decimal1).toString(),
            0,
            process.env.FLASH_LOANER,
            ethers.utils.arrayify(router_path.addr_from + router_path.addr_to1.substring(2) + router_path.addr_to1.substring(2) +
                router_path.token0.substring(2) + router_path.token1.substring(2) + router_path.token2.substring(2)),
            {
                nonce: txCount,
                gasLimit: web3_HTTPS.utils.toHex(500000),
                gasPrice: web3_HTTPS.utils.toHex(Number(gasPrice.high)),
            })

        const txHash = tx.hash;
        console.log('hash', txHash);
        const receipt = await tx.wait();
        console.log(`|***********Buy Tx was mined in block: ${receipt.blockNumber}`);
        console.log("Approved DateTime:", Date());

        await sleep(100);
    }
}

const writeAllPairs = async () => {
    const factories = [];

    for (const exchange of Object.values(exchanges)) {//get factory and router contracts
        const router = new web3.eth.Contract(routerABI, exchange);
        const factory = new web3.eth.Contract(factoryABI, await router.methods.factory().call());
        factories.push({ factory, router_addr: exchange });
    }

    const tokenWETH = tokens["WETH"];
    const tokensWithoutWETH = { ...tokens };
    delete tokensWithoutWETH["WETH"];

    const first_pairs = [];
    console.log("first pair loading...")
    for (const factory of Object.values(factories)) {
        for (const token of Object.values(tokensWithoutWETH)) {
            try {
                const pair_addr = await factory.factory.methods.getPair(tokenWETH, token).call();
                if (pair_addr === "0x0000000000000000000000000000000000000000")
                    continue;

                const token0Symbol = "WETH";
                const token0Decimals = "18";

                const token1Contract = await new web3.eth.Contract(erc20ABI, token);
                const token1Symbol = token === "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" ? "MKR" : await token1Contract.methods.symbol().call();
                const token1Decimals = await token1Contract.methods.decimals().call();

                const pairContract = await new web3.eth.Contract(pairABI, pair_addr);
                const reserves = await pairContract.methods.getReserves().call();

                let tokenPrice = 0;
                if (tokenWETH > token) {
                    const reserve0 = ethers.utils.formatUnits(reserves[0], token1Decimals);
                    const reserve1 = ethers.utils.formatUnits(reserves[1], 18);

                    tokenPrice = (+reserve1 == 0) ? 0 : +reserve0 / +reserve1;
                }
                else {
                    const reserve0 = ethers.utils.formatUnits(reserves[0], 18);
                    const reserve1 = ethers.utils.formatUnits(reserves[1], token1Decimals);

                    tokenPrice = (+reserve0 == 0) ? 0 : +reserve1 / +reserve0;
                }

                first_pairs.push({
                    router_addr: factory.router_addr,
                    pair_addr,
                    tokenPrice,
                    token0: { addr: tokenWETH, symbol: token0Symbol, decimals: token0Decimals },
                    token1: { addr: token, symbol: token1Symbol, decimals: token1Decimals }
                });

                console.log(token0Symbol, token1Symbol, pair_addr);
            }
            catch (err) {
                console.log(err);
            }
        }
    }
    fs.writeFile("first_pairs.json", JSON.stringify(first_pairs), function (err) {
        if (err) throw err;
        console.log('\nended writing-first_pairs');
    });

    const second_pairs = [];
    console.log("second pair loading...")
    for (const factory of Object.values(factories)) {
        for (const token0 of Object.values(tokensWithoutWETH)) {
            for (const token1 of Object.values(tokensWithoutWETH)) {
                try {
                    if (token0 === token1) continue;
                    const pair_addr = await factory.factory.methods.getPair(token0, token1).call();
                    if (pair_addr === "0x0000000000000000000000000000000000000000") continue;

                    const token0Contract = await new web3.eth.Contract(erc20ABI, token0);
                    const token0Symbol = token0 === "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" ? "MKR" : await token0Contract.methods.symbol().call();
                    const token0Decimals = await token0Contract.methods.decimals().call();

                    const token1Contract = await new web3.eth.Contract(erc20ABI, token1);
                    const token1Symbol = token1 === "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" ? "MKR" : await token1Contract.methods.symbol().call();
                    const token1Decimals = await token1Contract.methods.decimals().call();

                    second_pairs.push({
                        router_addr: factory.router_addr,
                        pair_addr,
                        token0: { addr: token0, symbol: token0Symbol, decimals: token0Decimals },
                        token1: { addr: token1, symbol: token1Symbol, decimals: token1Decimals }
                    });

                    console.log(token0Symbol, token1Symbol, pair_addr);
                }
                catch (err) {
                    console.log(err);
                }
            }
        }
    }
    fs.writeFile("second_pairs.json", JSON.stringify(second_pairs), function (err) {
        if (err) throw err;
        console.log('\nended writing-second_pairs');
    });

    const router_paths = [];
    for (const first_pair of Object.values(first_pairs)) {
        for (const second_pair of Object.values(second_pairs)) {
            if (first_pair.token1.addr === second_pair.token0.addr) {
                for (const third_pair of Object.values(first_pairs)) {
                    if (second_pair.token1.addr === third_pair.token1.addr) {
                        router_paths.push({
                            description: `WETH/${first_pair.token1.symbol}/${second_pair.token1.symbol}`,
                            price: first_pair.tokenPrice,
                            addr_from: first_pair.router_addr,
                            addr_to1: second_pair.router_addr,
                            addr_to2: third_pair.router_addr,
                            token0: first_pair.token0.addr,
                            token1: first_pair.token1.addr,
                            token2: second_pair.token1.addr,
                            decimal0: first_pair.token0.decimals,
                            decimal1: first_pair.token1.decimals,
                            decimal2: second_pair.token1.decimals
                        });
                    }
                }
            }
            else if (first_pair.token1.addr === second_pair.token1.addr) {
                for (const third_pair of Object.values(first_pairs)) {
                    if (second_pair.token0.addr === third_pair.token1.addr) {
                        router_paths.push({
                            description: `WETH/${first_pair.token1.symbol}/${second_pair.token0.symbol}`,
                            price: first_pair.tokenPrice,
                            addr_from: first_pair.router_addr,
                            addr_to1: second_pair.router_addr,
                            addr_to2: third_pair.router_addr,
                            token0: first_pair.token0.addr,
                            token1: first_pair.token1.addr,
                            token2: second_pair.token0.addr,
                            decimal0: first_pair.token0.decimals,
                            decimal1: first_pair.token1.decimals,
                            decimal2: second_pair.token0.decimals
                        });
                    }
                }
            }
        }
    }
    fs.writeFile("router_paths.json", JSON.stringify(router_paths), function (err) {
        if (err) throw err;
        console.log('\nended writing-router_paths');
    });

    console.log("finished.");
}

const command = process.argv.slice(2);
if (command.length == 0) {
    console.log("Bot started!");
    runBot();
} else {
    if (command[0] == '--write') {
        console.log("Writing all pairs")
        writeAllPairs();
    }
}
