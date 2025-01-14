import { CA, Intent, ProgressStep } from '@arcana/ca-sdk'
import { AllowanceHookInput, EthereumProvider } from '@arcana/ca-sdk/dist/types/typings'
import { NullValueNode } from 'graphql'
import { useModalContext } from 'src/hooks/useModal'





let caSDK: CA | null = null
let isInitialized = false
let balance: { symbol: string; balance: string; balanceInFiat: number; decimals: number; icon: string | undefined; breakdown: { chain: { id: number; name: string; logo: string }; network: "evm"; contractAddress: `0x${string}`; isNative: boolean | undefined; balance: string; balanceInFiat: number }[]; local: boolean | undefined; abstracted: boolean | undefined }[] | null = null
let allowance : {
    data: AllowanceHookInput,
    allow: ((s: Array<"min" | "max" | bigint | string>) => void) | null,
    deny: (() => void) | null,
    open: boolean
    allowances: Array<"min" | "max" | bigint | string>
} = {
    data: [],
    allow: null,
    deny: null,
    open: false,
    allowances: []
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


  const eventListener = async (data: any) => {
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
        if(data.data.typeID=="IF"){
            await caSDK?.getUnifiedBalances().then((res) => {
                console.log("balance refreshed: ", res);
                balance = res;
            });
        }
        console.log({ v })
        if (v) {
          v.done = true
          if (data.data.data) {
            v.data = data.data.data
          }
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
                balance = await caSDK.getUnifiedBalances()
                isInitialized = true
                console.log('CA SDK initialized')
                console.log("event listener", caSDK.caEvents.eventNames)
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
    await initializeCA(injectedProvider)
    return caSDK;
}


const useBalance = (
  refresh: boolean = false
) => {
    if(refresh){
        caSDK?.getUnifiedBalances().then((res) => {
            balance = res;
        });
    }
    return balance;
}

const useBridge = (amount: string | number, chainId: number, symbol: string) => {
    return caSDK?.bridge().amount(amount).chain(chainId).token(symbol).exec()
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

const useCaState = () => {
    return state
}




export { useCaSdkAuth, useBalance, useBridge, checkCA, useAllowance, useCaIntent, clearCaIntent, useCaState }
