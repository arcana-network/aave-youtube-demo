import { CA } from '@arcana/ca-sdk'
import { EthereumProvider } from '@arcana/ca-sdk/dist/types/typings'

let caSDK: CA | null = null
let balance: { symbol: string; balance: string; balanceInFiat: number; decimals: number; icon: string | undefined; breakdown: { chain: { id: number; name: string; logo: string }; network: "evm"; contractAddress: `0x${string}`; isNative: boolean | undefined; balance: string; balanceInFiat: number }[]; local: boolean | undefined; abstracted: boolean | undefined }[] | null = null

const useCaSdkAuth = async () => {
    const initializeCA = async (provider: EthereumProvider) => {
        try {
            if (!caSDK) {
                console.log('Initializing CA SDK...')
                caSDK = new CA(provider, {
                    network: 'dev',
                })
                await caSDK.init()
                balance = await caSDK.getUnifiedBalances()
                console.log('CA SDK initialized:', caSDK)
            }
        } catch (error) {
            console.error('Error initializing CA SDK:', error)
        }
    }
    // @ts-expect-error
    const injectedProvider = window.ethereum;
    await initializeCA(injectedProvider)
    return caSDK;
}


const useBalance = () => {
    return balance;
}

const useBridge = (amount: string | number, chainId: number,symbol: string) => {
    return caSDK?.bridge().amount(amount).chain(chainId).token(symbol).exec()
}

export { useCaSdkAuth, useBalance, useBridge }