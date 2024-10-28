import { BlockTxTuple } from "../common";
import { CallType, ContractType } from "./contract";

export type TxType = 
    | { type: "transfer"; asset: BlockTxTuple; n_outputs: number; amounts: number[] }
    | { type: "contract_creation"; contractType: ContractType }
    | { type: "contract_call"; contract: BlockTxTuple; callType: CallType };