import {
  BitcoinAddress,
  BlockHeight,
  BlockTxTuple,
  Pubkey,
  Ratio,
  RelativeOrAbsoluteBlockHeight,
  U128,
} from "../../utils";

export type InputAsset =
  | "raw_btc"
  | { glittr_asset: BlockTxTuple }
  | "metaprotocol"

// Update TransferScheme enum
export type TransferScheme = { purchase: BitcoinAddress } | { burn: {} };

// New TransferRatioType enum
export type TransferRatioType =
  | {
      fixed: {
        ratio: Ratio;
      };
    }
  | {
      oracle: {
        pubkey: Pubkey; // compressed public key
        setting: OracleSetting;
      };
    };

// New OracleSetting type
export type OracleSetting = {
  // set asset_id to none to fully trust the oracle, ordinal_number if ordinal, rune's block_tx if rune, etc
  asset_id?: string;
  // delta block_height in which the oracle message still valid
  block_height_slippage: number;
};

export type FreeMint = {
  supply_cap?: U128;
  amount_per_mint: U128;
};

export type VestingPlan =
  | { timelock: RelativeOrAbsoluteBlockHeight }
  | { scheduled: Array<[Ratio, RelativeOrAbsoluteBlockHeight]> };

export type Preallocated = {
  allocations: Record<U128, Pubkey[]>;
  vesting_plan: VestingPlan;
};

export type PurchaseBurnSwap = {
  input_asset: InputAsset;
  transfer_scheme: TransferScheme;
  transfer_ratio_type: TransferRatioType;
};

export type NFTAsset = {
  supply_cap?: U128;
  divisibility: number;
  name: string;
  url: string;
  url_hash: string;
  live_time: BlockHeight;
};

export type DistributionSchemes = {
  preallocated?: Preallocated;
  free_mint?: FreeMint;
  purchase?: PurchaseBurnSwap;
};

export type NFTContract = {
  asset: NFTAsset;
  distribution_schemes: DistributionSchemes;
};
