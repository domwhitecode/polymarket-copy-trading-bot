import { ethers } from 'ethers';
import { ENV } from '../../config/env';
import fetchData from '../../utils/fetchData';

const PROXY_WALLET = ENV.PROXY_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const RPC_URL = ENV.RPC_URL || 'https://polygon-rpc.com';

// Contract addresses on Polygon
const CTF_CONTRACT_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Thresholds for considering a position "resolved"
const RESOLVED_HIGH = 0.99;
const RESOLVED_LOW = 0.01;
const ZERO_THRESHOLD = 0.0001;

interface Position {
    asset: string;
    conditionId: string;
    size: number;
    avgPrice: number;
    currentValue: number;
    curPrice: number;
    title?: string;
    outcome?: string;
    slug?: string;
    redeemable?: boolean;
}

export interface RedeemResult {
    success: boolean;
    redeemedCount: number;
    failedCount: number;
    totalValue: number;
    error?: string;
    details: Array<{
        conditionId: string;
        title: string;
        success: boolean;
        value: number;
        error?: string;
    }>;
}

// CTF Contract ABI (only the functions we need)
const CTF_ABI = [
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external',
    'function balanceOf(address owner, uint256 tokenId) external view returns (uint256)',
];

const loadPositions = async (address: string): Promise<Position[]> => {
    const url = `https://data-api.polymarket.com/positions?user=${address}`;
    const data = await fetchData(url);
    const positions = Array.isArray(data) ? (data as Position[]) : [];
    return positions.filter((pos) => (pos.size || 0) > ZERO_THRESHOLD);
};

const redeemPosition = async (
    ctfContract: ethers.Contract,
    position: Position
): Promise<{ success: boolean; error?: string }> => {
    try {
        const conditionIdBytes32 = ethers.utils.hexZeroPad(
            ethers.BigNumber.from(position.conditionId).toHexString(),
            32
        );

        const parentCollectionId = ethers.constants.HashZero;
        const indexSets = [1, 2];

        const feeData = await ctfContract.provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

        if (!gasPrice) {
            throw new Error('Could not determine gas price');
        }

        const adjustedGasPrice = gasPrice.mul(120).div(100);

        const tx = await ctfContract.redeemPositions(
            USDC_ADDRESS,
            parentCollectionId,
            conditionIdBytes32,
            indexSets,
            {
                gasLimit: 500000,
                gasPrice: adjustedGasPrice,
            }
        );

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            return { success: true };
        } else {
            return { success: false, error: 'Transaction reverted' };
        }
    } catch (error: any) {
        const errorMessage = error.message || String(error);
        return { success: false, error: errorMessage };
    }
};

export async function getRedeemablePositions(): Promise<{
    redeemable: Position[];
    total: number;
    totalValue: number;
}> {
    const allPositions = await loadPositions(PROXY_WALLET);

    const redeemablePositions = allPositions.filter(
        (pos) =>
            (pos.curPrice >= RESOLVED_HIGH || pos.curPrice <= RESOLVED_LOW) &&
            pos.redeemable === true
    );

    const totalValue = redeemablePositions.reduce(
        (sum, pos) => sum + (pos.currentValue || 0),
        0
    );

    return {
        redeemable: redeemablePositions,
        total: redeemablePositions.length,
        totalValue,
    };
}

export async function redeemAllResolved(): Promise<RedeemResult> {
    const result: RedeemResult = {
        success: false,
        redeemedCount: 0,
        failedCount: 0,
        totalValue: 0,
        details: [],
    };

    try {
        const allPositions = await loadPositions(PROXY_WALLET);

        const redeemablePositions = allPositions.filter(
            (pos) =>
                (pos.curPrice >= RESOLVED_HIGH || pos.curPrice <= RESOLVED_LOW) &&
                pos.redeemable === true
        );

        if (redeemablePositions.length === 0) {
            result.success = true;
            result.error = 'No positions to redeem';
            return result;
        }

        // Setup provider and signer
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const ctfContract = new ethers.Contract(CTF_CONTRACT_ADDRESS, CTF_ABI, wallet);

        // Group positions by conditionId
        const positionsByCondition = new Map<string, Position[]>();
        redeemablePositions.forEach((pos) => {
            const existing = positionsByCondition.get(pos.conditionId) || [];
            existing.push(pos);
            positionsByCondition.set(pos.conditionId, existing);
        });

        for (const [conditionId, positions] of Array.from(positionsByCondition.entries())) {
            const totalPositionValue = positions.reduce(
                (sum, pos) => sum + pos.currentValue,
                0
            );
            const title = positions[0].title || positions[0].slug || conditionId;

            const redeemResult = await redeemPosition(ctfContract, positions[0]);

            if (redeemResult.success) {
                result.redeemedCount++;
                result.totalValue += totalPositionValue;
                result.details.push({
                    conditionId,
                    title,
                    success: true,
                    value: totalPositionValue,
                });
            } else {
                result.failedCount++;
                result.details.push({
                    conditionId,
                    title,
                    success: false,
                    value: totalPositionValue,
                    error: redeemResult.error,
                });
            }

            // Small delay between transactions
            if (positionsByCondition.size > 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }

        result.success = result.redeemedCount > 0 || result.failedCount === 0;
    } catch (error: any) {
        result.error = error.message || String(error);
    }

    return result;
}
