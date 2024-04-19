const { verifyContract } = require("../utils/helpers");
const { ethers, network, run } = require("hardhat");

// module.exports
const main  = async function () {
    const { name } = network;

    console.log("Deploying to network:", network);

    let router0, router1, weth;
    if (hre.network.name === "bscTestnet") {
        router0 = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
        router1 = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
        weth = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
    }
    else if (hre.network.name === "bsc") {
        router0 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
        router1 = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
        weth = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
    }

    console.log(`Router 0: ${router0}`);
    console.log(`Router 1: ${router1}`);
    console.log(`WETH: ${weth}`);


    const NormalArbitrage = await ethers.getContractFactory("NormalArbitrage");
    const NormalArbitrageContract = await NormalArbitrage.deploy(router0, router1, weth);
    await NormalArbitrageContract.waitForDeployment();

    const contractAddress = await NormalArbitrageContract.getAddress();

    console.log("NormalArbitrageContract:", contractAddress);

    verifyContract(name, contractAddress, [router0, router1, weth]);
}

main();

// module.exports.tags = ["NormalArbitrage"];
