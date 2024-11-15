import { initEccLib, networks, payments, Psbt, script } from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import { txBuilder, BitcoinUTXO } from "@glittr-sdk/sdk";

initEccLib(ecc);

const ELECTRUM_API = "https://devnet-electrum.glittr.fi"
const GLITTR_API = "https://devnet-core-api.glittr.fi"
const EXPLORER_URL = "https://explorer.glittr.fi"

function encodeGlittrData(message: string): Buffer {
  const glittrFlag = Buffer.from("GLITTR", "utf8"); // Prefix
  const glittrData = Buffer.from(message, "utf8");
  const embed = script.compile([106, glittrFlag, glittrData]);

  return embed;
}

async function getUtxo(address: string): Promise<BitcoinUTXO> {
  const utxosFetch = await fetch(`${ELECTRUM_API}/address/${address}/utxo`);
  const utxos = (await utxosFetch.json()) ?? [];
  const confirmedUtxos = utxos.filter(
    (tx: any) => tx?.status && tx?.status?.confirmed && tx.value > 1000
  );
  const utxo = confirmedUtxos[0];
  if (!utxo) {
    console.error(`Error No UTXO`);
    process.exit(1);
  }

  return utxo;
}

async function getTxHex(txId: string): Promise<string> {
  const txHexFetch = await fetch(`${ELECTRUM_API}/tx/${txId}/hex`);
  const txHex = await txHexFetch.text();
  if (!txHex) {
    console.error(`Error No TX Hex`);
    process.exit(1);
  }

  return txHex;
}

function generatePsbtHex(
  keypair: ECPairInterface,
  address: string,
  embed: Buffer,
  utxo: BitcoinUTXO,
  txHex: string,
  validator: (pubkey: any, msghash: any, signature: any) => boolean
): string {
  const psbt = new Psbt({ network: networks.regtest })
    .addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: Buffer.from(txHex, "hex"),
    })
    .addOutput({
      script: embed,
      value: 0,
    })
    .addOutput({ address, value: utxo.value - 1000 })
    .signInput(0, keypair);

  const isValid = psbt.validateSignaturesOfInput(0, validator);
  if (!isValid) {
    console.error(`Signature Invalid`);
    process.exit(1);
  }

  psbt.finalizeAllInputs();
  const hex = psbt.extractTransaction(true).toHex();

  return hex;
}

async function main() {
  const ecpair = ECPairFactory(ecc);
  const kp = ecpair.fromWIF(
    "cW84FgWG9U1MpKvdzZMv4JZKLSU7iFAzMmXjkGvGUvh5WvhrEASj", // bcrt1p909annaahk007276ny6ldnp2d7svjzx68249ptkcp45tptang5dqpjwerv
    networks.regtest
  );
  const payment = payments["p2pkh"]({
    pubkey: kp.publicKey,
    network: networks.regtest,
  });
  const validator = (pubkey: any, msghash: any, signature: any): boolean =>
    ecpair.fromPublicKey(pubkey).verify(msghash, signature);

  // Contract Creation Section
  const t = txBuilder.freeMintContractInstantiate({
    simple_asset: {
      supply_cap: 2000n.toString(),
      divisibility: 18,
      live_time: 0,
    },
    amount_per_mint: 2n.toString(),
  });
  const embed = encodeGlittrData(JSON.stringify(t));
  const utxo = await getUtxo(payment.address!);
  const txHex = await getTxHex(utxo.txid);
  const hex = generatePsbtHex(
    kp,
    payment.address!,
    embed,
    utxo,
    txHex,
    validator
  );

  // Validate tx
  const validateFetch = await fetch(`${GLITTR_API}/validate-tx`, {
    method: "POST",
    headers: { "Content-Type": " text-plain" },
    body: hex,
  });
  if (!validateFetch.ok) {
    console.error(`Fetch validate tx error ${validateFetch.statusText} `);
  }
  const validateTx = await validateFetch.json();
  if (!validateTx?.is_valid) {
    console.error(`Error : ${validateTx?.msg ?? "Tx invalid"}`);
    process.exit(1);
  }

  // Broadcast tx
  const txIdFetch = await fetch(`${ELECTRUM_API}/tx`, {
    method: "POST",
    headers: { "Content-Type": "text-plain" },
    body: hex,
  });
  if (!txIdFetch.ok) {
    console.error(`Error : Broadcasting transaction ${txIdFetch.statusText}`);
    process.exit(1);
  }
  const txId = await txIdFetch.text();

  console.log(`✅ Transaction Broadcasted Successfully (${EXPLORER_URL}/tx/${txId})`);
  const { default: ora } = await import("ora");
  const spinner = ora("Waiting for Glittr indexer . . .").start();

  let txData;
  let found = false;

  while (!found) {
    try {
      const tx = await fetch(`${GLITTR_API}/tx/${txId}`, {
        method: "GET",
      });

      if (tx.status === 404) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        txData = await tx.json();
        spinner.succeed("Transaction found!");
        console.log("Transaction found:", txData);
        found = true;
      }
    } catch (error) {
      spinner.fail("Error fetching transaction.");
      console.error("Error fetching transaction:", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      spinner.start("Waiting for Glittr indexer . . .");
    }
  }
  if (!txData) {
    console.error(`Error : Transaction data not found`);
    process.exit(1);
  }

  // Mint Section
  const m = txBuilder.mint({
    contract: [parseInt(txData?.block_tx.split(":")[0]), parseInt(txData?.block_tx.split(":")[1])],
    pointer: 1,
  });
  const embedMint = encodeGlittrData(JSON.stringify(m));
  const utxoMint = await getUtxo(payment.address!);
  const txHexMint = await getTxHex(utxoMint.txid);
  const hexMint = generatePsbtHex(
    kp,
    payment.address!,
    embedMint,
    utxoMint,
    txHexMint,
    validator
  );
  // Validate tx
  const validateFetchMint = await fetch(`${GLITTR_API}/validate-tx`, {
    method: "POST",
    headers: { "Content-Type": " text-plain" },
    body: hexMint,
  });
  if (!validateFetchMint.ok) {
    console.error(`Fetch validate tx error ${validateFetchMint.statusText} `);
  }
  const validateTxMint = await validateFetchMint.json();
  if (!validateTxMint?.is_valid) {
    console.error(`Error : ${validateTxMint?.msg ?? "Tx invalid"}`);
    process.exit(1);
  }

  // Broadcast tx
  const txIdFetchMint = await fetch(`${ELECTRUM_API}/tx`, {
    method: "POST",
    headers: { "Content-Type": "text-plain" },
    body: hexMint,
  });
  if (!txIdFetchMint.ok) {
    console.error(
      `Error : Broadcasting transaction ${txIdFetchMint.statusText}`
    );
    process.exit(1);
  }
  const txIdMint = await txIdFetchMint.text();
  console.log(txIdMint);
}

main();
