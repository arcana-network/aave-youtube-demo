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
import { clearCaIntent, useBalance, useBridge, useCaIntent, useCaSdkAuth } from 'src/services/ca';
import { roundToTokenDecimals } from 'src/utils/utils';
import Decimal from 'decimal.js';
import { useWalletBalances } from 'src/hooks/app-data-provider/useWalletBalances';

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
      addTransaction,
      currentMarketData,
    ] = useRootStore((state) => [
      state.tryPermit,
      state.supply,
      state.supplyWithPermit,
      state.walletApprovalMethodPreference,
      state.estimateGasLimit,
      state.addTransaction,
      state.currentMarketData,
    ]);
    const {
      approvalTxState,
      mainTxState,
      intentTxState,
      loadingTxns,
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
          console.log("CA Intent open")
          setIntentTxState({ ...intentTxState, loading: false, success: true });
        }
      }
      , 1000);
      return () => clearInterval(interval);
    }
    , [])

    const intentAction = async () => {
      try {
        const caBalances = useBalance();
          setIntentTxState({ ...intentTxState, loading: true, success: false });
          if(Number(caBalances?.find((balance) => balance.symbol === symbol)?.breakdown.find((breakdown) => breakdown.chain.id === currentMarketData.chainId)?.balance)<Number(amountToSupply)){ 
            const decimalAmount = new Decimal(amountToSupply).sub(caBalances?.find((balance) => balance.symbol === symbol)?.breakdown.find((breakdown) => breakdown.chain.id === currentMarketData.chainId)?.balance!).toString();
            await useBridge(decimalAmount, currentMarketData.chainId, symbol)?.then((res) => {
              console.log("CA completed")
              console.log({ res });
            });
            await action();
          }
      } catch (error) {
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
        handleConfirm={confirm}
        requiresApproval={requiresApproval}
        tryPermit={permitAvailable}
        sx={sx}
        {...props}
      />
    );
  }
);
