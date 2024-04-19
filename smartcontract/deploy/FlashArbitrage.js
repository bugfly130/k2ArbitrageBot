const { verifyContract } = require("../utils/helpers");
const { ethers, network, run } = require("hardhat");

const main  = async function () {
    const { name } = network;
    let router0, router1;
    if (hre.network.name === "bscTestnet") {
        router0 = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
        router1 = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    }
    else if (hre.network.name === "bsc") {
        router0 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
        router1 = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    }
    else if (hre.network.name === "goerli") {
        router0 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
        router1 = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    }

    console.log(`Network: ${name}`);
    // console.log(`Deployer: ${deployer}`);
    console.log(`Router 0: ${router0}`);
    console.log(`Router 1: ${router1}`);

    console.log("Waiting for Deploy...");
    
    const FlashArbitrage = await ethers.getContractFactory("FlashArbitrage");
    const FlashArbitrageContract = await FlashArbitrage.deploy(router0, router1);
    await FlashArbitrageContract.waitForDeployment();

    const contractAddress = await FlashArbitrageContract.getAddress();

    verifyContract(name, contractAddress, [router0, router1]);
}
main();
