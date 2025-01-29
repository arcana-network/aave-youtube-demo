import { ChainId, gasLimitRecommendations, ProtocolAction } from '@aave/contract-helpers';
import { TransactionResponse } from '@ethersproject/providers';
import { Trans } from '@lingui/macro';
import { BoxProps } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { parseUnits } from 'ethers/lib/utils';
import React, { useEffect, useState } from 'react';
import { SignedParams, useApprovalTx } from 'src/hooks/useApprovalTx';
import { usePoolApprovedAmount } from 'src/hooks/useApprovedAmount';
import { useModalContext } from 'src/hooks/useModal';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';
import { useRootStore } from 'src/store/root';
import { ApprovalMethod } from 'src/store/walletSlice';
import { getErrorTextFromError, TxAction } from 'src/ui-config/errorMapping';
import { queryKeysFactory } from 'src/ui-config/queries';

import { TxActionsWrapper } from '../TxActionsWrapper';
import { APPROVAL_GAS_LIMIT, checkRequiresApproval } from '../utils';
import { clearCaAllowance, clearCaIntent, useAllowance, useBalance, useBridge, useCaIntent, useCaSdkAuth } from 'src/services/ca';
import { roundToTokenDecimals } from 'src/utils/utils';
import Decimal from 'decimal.js';
import { useWalletBalances } from 'src/hooks/app-data-provider/useWalletBalances';
import { CA } from '@arcana/ca-sdk';
import { BigNumber } from 'ethers';
export interface SupplyActionProps extends BoxProps {
  amountToSupply: string;
  isWrongNetwork: boolean;
  customGasPrice?: string;
  poolAddress: string;
  symbol: string;
  blocked: boolean;
  decimals: number;
  isWrappedBaseAsset: boolean;
}

export const SupplyActions = React.memo(
  ({
    amountToSupply,
    poolAddress,
    isWrongNetwork,
    sx,
    symbol,
    blocked,
    decimals,
    isWrappedBaseAsset,
    ...props
  }: SupplyActionProps) => {
    const [
      tryPermit,
      supply,
      supplyWithPermit,
      walletApprovalMethodPreference,
      estimateGasLimit,
      caGasPrice,
      addTransaction,
      currentMarketData,
    ] = useRootStore((state) => [
      state.tryPermit,
      state.supply,
      state.supplyWithPermit,
      state.walletApprovalMethodPreference,
      state.estimateGasLimit,
      state.caGasPrice,
      state.addTransaction,
      state.currentMarketData,
    ]);
    const {
      approvalTxState,
      mainTxState,
      intentTxState,
      loadingTxns,
      allowanceState,
      setAllowanceState,
      setLoadingTxns,
      setIntentTxState,
      setApprovalTxState,
      setMainTxState,
      setGasLimit,
      setTxError,
    } = useModalContext();
    const permitAvailable = tryPermit({ reserveAddress: poolAddress, isWrappedBaseAsset });
    const { sendTx, currentAccount } = useWeb3Context();
    const queryClient = useQueryClient();
    
  const { walletBalances } = useWalletBalances(currentMarketData);
    const [signatureParams, setSignatureParams] = useState<SignedParams | undefined>();
    
    const {
      data: approvedAmount,
      refetch: fetchApprovedAmount,
      isRefetching: fetchingApprovedAmount,
      isFetchedAfterMount,
    } = usePoolApprovedAmount(currentMarketData, poolAddress);

    setLoadingTxns(fetchingApprovedAmount);

    const requiresApproval =
      Number(amountToSupply) !== 0 &&
      checkRequiresApproval({
        approvedAmount: approvedAmount?.amount || '0',
        amount: amountToSupply,
        signedAmount: signatureParams ? signatureParams.amount : '0',
      });

    if (requiresApproval && approvalTxState?.success) {
      // There was a successful approval tx, but the approval amount is not enough.
      // Clear the state to prompt for another approval.
      setApprovalTxState({});
    }

    const usePermit = permitAvailable && walletApprovalMethodPreference === ApprovalMethod.PERMIT;

    const { approval } = useApprovalTx({
      usePermit,
      approvedAmount,
      requiresApproval,
      assetAddress: poolAddress,
      symbol,
      decimals,
      signatureAmount: amountToSupply,
      onApprovalTxConfirmed: fetchApprovedAmount,
      onSignTxCompleted: (signedParams) => setSignatureParams(signedParams),
    });

    const ifApprove = async () => {
      try {
        // add ca ca SDk bridge
        // isApproved = true;
        //await useBridge(amountToSupply, currentMarketData.chainId, symbol);
        setApprovalTxState({ ...approvalTxState, loading: true });
        await approval();
      } catch (error) {
        const parsedError = getErrorTextFromError(error, TxAction.APPROVAL, false);
        setTxError(parsedError); 
        setApprovalTxState({ ...approvalTxState, loading: false });
      }
    }
    const allowance = useAllowance();

    const ifAllowance = async () => {
      try {
          useAllowance().open = false;
          const values = useAllowance().data.map(() => "1.15")
          console.log("values: ", values)
          const allowance = useAllowance();
          if (allowance && allowance.allow) {
            allowance.allow(values);
            setAllowanceState({ ...allowanceState, loading: true, success: false });
          }
      } catch (error) {
        console.log("error: ", error)
        const parsedError = getErrorTextFromError(error, TxAction.APPROVAL, false);
        setTxError(parsedError);
        setApprovalTxState({ ...approvalTxState, loading: false });
      }
    }

    useEffect(() => {
      if (!isFetchedAfterMount) {
        fetchApprovedAmount();
      }
    }, [fetchApprovedAmount, isFetchedAfterMount]);

    // Update gas estimation
    useEffect(() => {
      let supplyGasLimit = 0;
      if (usePermit) {
        supplyGasLimit = Number(
          gasLimitRecommendations[ProtocolAction.supplyWithPermit].recommended
        );
      } else {
        supplyGasLimit = Number(gasLimitRecommendations[ProtocolAction.supply].recommended);
        if (requiresApproval && !approvalTxState.success) {
          supplyGasLimit += Number(APPROVAL_GAS_LIMIT);
        }
      }
      setGasLimit(supplyGasLimit.toString());
    }, [requiresApproval, approvalTxState, usePermit, setGasLimit]);

    const action = async () => {
      try {
        console.log("entered action")
        // setMainTxState({ ...mainTxState, loading: true });
        console.log("moving to supply")
        let response: TransactionResponse;
        let action = ProtocolAction.default;

        // determine if approval is signature or transaction
        // checking user preference is not sufficient because permit may be available but the user has an existing approval
        if (usePermit && signatureParams) {
          action = ProtocolAction.supplyWithPermit;
          let signedSupplyWithPermitTxData = supplyWithPermit({
            signature: signatureParams.signature,
            amount: parseUnits(amountToSupply, decimals).toString(),
            reserve: poolAddress,
            deadline: signatureParams.deadline,
          });

          signedSupplyWithPermitTxData = await estimateGasLimit(signedSupplyWithPermitTxData);
          response = await sendTx(signedSupplyWithPermitTxData);

          await response.wait(1);
        } else {
          action = ProtocolAction.supply;
          let supplyTxData = supply({
            amount: parseUnits(amountToSupply, decimals).toString(),
            reserve: poolAddress,
          });
          supplyTxData = await estimateGasLimit(supplyTxData);
          response = await sendTx(supplyTxData);

          await response.wait(1);
        }
        await useBalance(true);
        setMainTxState({
          txHash: response.hash,
          loading: false,
          success: true,
        });

        addTransaction(response.hash, {
          action,
          txState: 'success',
          asset: poolAddress,
          amount: amountToSupply,
          assetName: symbol,
        });

        queryClient.invalidateQueries({ queryKey: queryKeysFactory.pool });
      } catch (error) {
        const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
        setTxError(parsedError);
        setMainTxState({
          txHash: undefined,
          loading: false,
        });
      }
    
    };
    
    useEffect(() => {
      const interval = setInterval(async () => {
        if(useCaIntent().open){
          console.log("Intent Open")
          setAllowanceState({ loading: false });
          setIntentTxState({ loading: false, success: true });
        }
        if(useAllowance().open){
          setAllowanceState({ loading: false, success: true });
          setIntentTxState({ loading: false });
          console.log("Allowance open: ", allowanceState);
        }
      }
      , 1000);
      return () => clearInterval(interval);
    }
    , [])

    const intentAction = async () => {
      try {
        const caBalances = useBalance();
        let gas = caBalances?.find((balance) => balance.symbol =="ETH")?.balanceInFiat! > 0.01 ? (BigNumber.from(0)) : await caGasPrice(currentMarketData.chainId);
        console.log("gas: ", gas)
          setIntentTxState({ ...intentTxState, loading: true, success: false });
          setAllowanceState({ ...allowanceState, loading: true, success: false });
          if(            (CA.getSupportedChains().find((chain) => chain.id === currentMarketData.chainId))
          &&
          Number(caBalances?.find((balance) => balance.symbol === (symbol == "WETH"? "ETH": symbol))?.breakdown.find((breakdown) => breakdown.chain.id === currentMarketData.chainId)?.balance)<Number(amountToSupply)){ 
            console.log("CA required")
            const decimalAmount = new Decimal(amountToSupply).sub(caBalances?.find((balance) => balance.symbol === (symbol == "WETH"? "ETH": symbol))?.breakdown.find((breakdown) => breakdown.chain.id === currentMarketData.chainId)?.balance!).add(symbol == "WETH" ? '': '0.00001').toString();
            await useBridge(decimalAmount, currentMarketData.chainId, (symbol == "WETH" ? "ETH": symbol), BigInt(gas!.toNumber()))?.then((res) => {
              console.log("CA completed")
              console.log({ res });
            });
            if(requiresApproval){
              console.log("Requires approval")
              await ifApprove();
            }
            await action();
          }
          else{
            console.log("CA not required")
            await action();
          }
      } catch (error) {
        console.log("error: ", error)
        const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
        setTxError(parsedError);
        setMainTxState({
          txHash: undefined,
          loading: false,
        });
      }
    }

    const confirm = async () => {
      useCaIntent().allow();
      // check if transaction has gone through
      setMainTxState({ ...mainTxState, loading: true });
      clearCaIntent();
    }

    return (
      <TxActionsWrapper
        blocked={blocked}
        mainTxState={mainTxState}
        approvalTxState={approvalTxState}
        intentTxState={intentTxState}
        isWrongNetwork={isWrongNetwork}
        allowanceTxState={allowanceState}
        requiresAmount
        amount={amountToSupply}
        symbol={symbol}
        preparingTransactions={loadingTxns || !approvedAmount}
        actionText={<Trans>Supply {symbol}</Trans>}
        actionInProgressText={<Trans>Supplying {symbol}</Trans>}
        intentActionText={<Trans>Confirm </Trans>}
        intentActionInProgressText={<Trans>Processing</Trans>}
        handleApproval={ifApprove}
        handleAction={intentAction}
        handleAllowance={ifAllowance}
        handleConfirm={confirm}
        requiresApproval={requiresApproval}
        tryPermit={permitAvailable}
        sx={sx}
        {...props}
      />
    );
  }
);
