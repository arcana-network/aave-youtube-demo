import { CA, Intent, ProgressStep } from '@arcana/ca-sdk'
import { AllowanceHookInput, EthereumProvider } from '@arcana/ca-sdk/dist/types/typings'
import { min } from 'cypress/types/lodash'
import { NullValueNode } from 'graphql'
import { useCallback } from 'react'
import { useModalContext } from 'src/hooks/useModal'





let caSDK: CA | null = null
let isInitialized = false
let balance: { symbol: string; balance: string; balanceInFiat: number; decimals: number; icon: string | undefined; breakdown: { chain: { id: number; name: string; logo: string }; network: "evm"; contractAddress: `0x${string}`; isNative: boolean | undefined; balance: string; balanceInFiat: number }[]; local: boolean | undefined; abstracted: boolean | undefined }[] | null = null
let allowance : {
    data: Array<{
      minAllowance: string;
      currentAllowance: string;
      chainID: number;
      chainName: string;
      token: {
          contractAddress: `0x${string}`;
          decimals: number;
          symbol: string;
          name: string;
      };
  }>,
    allow: ((s: Array<"min" | "max" | bigint | string>) => void) | null,
    deny: (() => void),
    open: boolean
    allowances: Array<"min" | "max" | bigint | string>,
    values: Array<{ chainID: number; allowance: bigint; token: string }>
} = {
    data: [{
      minAllowance: "0",
      currentAllowance: "0",
      chainID: 1,
      chainName: "Ethereum",
      token: {
          contractAddress: `0x`,
          decimals: 0,
          symbol: "ETH",
          name: "Ethereum"
      }
    }
    ],
    allow: null,
    deny: () => { },
    open: false,
    allowances: [],
    values: [ 
    ]
  };

let caIntent : {
    open: boolean
    allow: () => void
    deny: () => void
    refresh: (() => Promise<Intent>) | null
    intent: Intent | null
    sourcesOpen: boolean
    feesBreakupOpen: boolean
    intervalHandler: number | null
    intentRefreshing: boolean
    completed: boolean
} = {
    allow: () => { },
    deny: () => { },
    refresh: null,
    intent: null,
    open: false,
    sourcesOpen: true,
    feesBreakupOpen: false,
    intervalHandler: null,
    intentRefreshing: false,
    completed: false
  };

  let state : {
    inProgress: boolean,
    completed: boolean
    steps: Array<ProgressStep & { done: boolean }>
  }
    = {
        inProgress: false,
        completed: false,
        steps: []
    }


  export const eventListener = async (data: any) => {
    switch (data.type) {
      case "EXPECTED_STEPS": {
        console.log("Expected steps", data.data)
        state.steps = data.data.map((s: ProgressStep) => ({ ...s, done: false }))
        state.inProgress = true
        break;
      }
      case "STEP_DONE": {
        console.log("Step done", data.data)
        const v = state.steps.find(s => {
          return s.typeID === data.data.typeID
        })
        console.log({ v })
        if (v) {
          v.done = true
          if (data.data.data) {
            v.data = data.data.data
          }
        }
        if(data.data.typeID=="IF"){
          await caSDK?.getUnifiedBalances().then((res) => {
              console.log("balance refreshed: ", res);
              balance = res;
          });
      }
        break;
      }
    }
  }


const useCaSdkAuth = async () => {
    const initializeCA = async (provider: EthereumProvider) => {
        try {
            if (!caSDK) {
                console.log('Initializing CA SDK...')
                caSDK = new CA(provider, {
                    network: 'testnet',
                })
                caSDK.addCAEventListener(eventListener)
                await caSDK.init()
                balance = await caSDK?.getUnifiedBalances()!;
                allowance.values = await caSDK.allowance().get()
                console.log('allowance values:', allowance.values)
                isInitialized = true
                console.log('CA SDK initialized')
                caSDK.setOnAllowanceHook(async ({allow, deny, sources}) => {
                  console.log("allowance hook: ", {allow, deny, sources})
                    allowance.allow = allow;
                    allowance.deny = deny;
                    allowance.open = true;
                    allowance.data = sources;
                    allowance.allowances = ["max"];
                });
                caSDK.setOnIntentHook(({intent, allow, deny, refresh}) => {
                    console.log('intent hook', {intent})
                    caIntent.allow = allow;
                    caIntent.deny = deny;
                    caIntent.refresh = refresh; 
                    caIntent.intent = intent;
                    caIntent.open = true;
                });
            }
        } catch (error) {
            console.error('Error initializing CA SDK:', error)
        }
    }
    // @ts-expect-error
    const injectedProvider = window.ethereum;
    await initializeCA(injectedProvider).then(async () => {
      balance = await caSDK?.getUnifiedBalances()!;
    });
    return caSDK;
}


const useBalance = (
  refresh: boolean = false
) => {
    if(refresh && caSDK!=null){
        useCaSdkAuth()
    }
    return balance;
}

const useBridge = (amount: string | number, chainId: number, symbol: string, gas: bigint) => {
  console.log("symbol: ", symbol)
    return caSDK?.bridge().amount(amount).chain(chainId).token(symbol).gas(gas).exec()
}

// isInitialised as a hook
const checkCA = async () => {
    return isInitialized
}

const useAllowance = () => {
    return allowance
}

const useCaIntent = () => {
    return caIntent
}

const clearCaIntent = () => {
    caIntent.allow = () => { };
    caIntent.deny = () => { };
    caIntent.refresh = null;
    caIntent.intent = null;
    caIntent.open = false;
    caIntent.sourcesOpen = true;
    caIntent.feesBreakupOpen = false;
    caIntent.intervalHandler = null;
    caIntent.intentRefreshing = false;
}

const clearCaAllowance = () => {
    allowance.allow = null;
    allowance.deny = () => { };
    allowance.open = false;
    allowance.values = []
}

const useCaState = () => {
    return state
}




export { useCaSdkAuth, useBalance, useBridge, checkCA, useAllowance, useCaIntent, clearCaIntent, useCaState, clearCaAllowance }
