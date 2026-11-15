import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BusinessSettings, Order } from '../types/cafe';
import { formatManilaTime, formatPHP } from '../lib/businessLogic';

interface ReceiptPrinterModalProps {
  order: Order;
  business: BusinessSettings;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  onClose: () => void;
}

type PaperFormat = '58mm' | '80mm' | 'A4' | 'Letter';
type TemplateType = 'customer' | 'kitchen' | 'delivery';

export const ReceiptPrinterModal: React.FC<ReceiptPrinterModalProps> = ({
  order,
  business,
  branchName,
  branchAddress,
  branchPhone,
  onClose,
}) => {
  const [paperSize, setPaperSize] = useState<PaperFormat>('80mm');
  const [template, setTemplate] = useState<TemplateType>('customer');

  const widthClass =
    paperSize === '58mm'
      ? 'w-[240px]'
      : paperSize === '80mm'
        ? 'w-[320px]'
        : 'w-full max-w-[680px]';

  const trackingUrl = `${window.location.origin}/track/${order.trackingToken}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white border border-[#E8DFD3] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="no-print flex items-center justify-between px-5 py-3.5 border-b border-[#E8DFD3] bg-[#FAF8F5]">
          <div>
            <h3 className="font-semibold text-[#231914] text-base">Print Preview & Receipt</h3>
            <p className="text-xs text-[#6E5040]">
              Browser print prompts user confirmation. Silent automatic printing requires a local print-bridge service.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6E5040] hover:text-[#231914] rounded-lg"
            aria-label="Close print preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[#E8DFD3] bg-white">
          <div className="flex items-center gap-1 p-1 bg-[#F4EFE8] rounded-lg">
            {(['customer', 'kitchen', 'delivery'] as TemplateType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTemplate(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap ${
                  template === t ? 'bg-white text-[#231914] shadow-sm' : 'text-[#6E5040]'
                }`}
              >
                {t} Ticket
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {(['58mm', '80mm', 'A4', 'Letter'] as PaperFormat[]).map((sz) => (
              <button
                key={sz}
                onClick={() => setPaperSize(sz)}
                className={`px-2.5 py-1 text-xs font-mono rounded border whitespace-nowrap ${
                  paperSize === sz
                    ? 'bg-[#231914] text-white border-[#231914]'
                    : 'bg-white text-[#523B2F] border-[#D7C8B6]'
                }`}
              >
                {sz}
              </button>
            ))}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-[#3A2920] text-white rounded-lg hover:bg-[#231914] whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Now
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-[#F4EFE8] flex justify-center">
          <div className={`${widthClass} bg-white p-5 border border-[#D7C8B6] text-[#1C1410] font-mono text-xs leading-relaxed`}>
            <div className="text-center border-b border-dashed border-[#A98976] pb-3 mb-3">
              <div className="font-sans font-bold text-base tracking-tight">{business.businessName}</div>
              <div>{branchName}</div>
              <div className="text-[11px] text-[#523B2F]">{branchAddress}</div>
              <div className="text-[11px] text-[#523B2F]">{branchPhone}</div>
              {business.tin && <div className="text-[11px]">TIN: {business.tin}</div>}
            </div>

            <div className="flex justify-between text-[11px] mb-1">
              <span>Order:</span>
              <span className="font-semibold">{order.orderNumber}</span>
            </div>
            <div className="flex justify-between text-[11px] mb-1">
              <span>Queue:</span>
              <span className="font-bold text-sm">{order.queueNumber}</span>
            </div>
            <div className="flex justify-between text-[11px] mb-1">
              <span>Type:</span>
              <span className="uppercase">{order.orderType.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between text-[11px] mb-3 border-b border-dashed border-[#A98976] pb-2">
              <span>Date:</span>
              <span>{formatManilaTime(order.createdAt)}</span>
            </div>

            {template === 'delivery' && (
              <div className="mb-3 pb-2 border-b border-dashed border-[#A98976] text-[11px]">
                <div className="font-bold">DELIVERY DETAILS</div>
                <div>Recipient: {order.customerName || 'Guest'}</div>
                <div>Phone: {order.customerPhone || 'N/A'}</div>
                <div>Address: {order.deliveryAddress || 'N/A'}</div>
                {order.deliveryNotes && <div>Notes: {order.deliveryNotes}</div>}
              </div>
            )}

            <div className="space-y-1.5 border-b border-dashed border-[#A98976] pb-3 mb-3">
              {order.items.map((item) => (
                <div key={item.id}>
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {item.quantity}x {item.productName}
                      {item.variantName ? ` (${item.variantName})` : ''}
                    </span>
                    {template !== 'kitchen' && (
                      <span className="tabular-nums">{formatPHP(item.lineTotal)}</span>
                    )}
                  </div>
                  {item.modifiers.length > 0 && (
                    <div className="text-[10px] text-[#523B2F] pl-3">
                      {item.modifiers.map((m) => m.optionName).join(' · ')}
                    </div>
                  )}
                  {item.notes && <div className="text-[10px] italic pl-3">Note: {item.notes}</div>}
                </div>
              ))}
            </div>

            {template !== 'kitchen' && (
              <div className="space-y-1 border-b border-dashed border-[#A98976] pb-3 mb-3 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatPHP(order.subtotal)}</span>
                </div>
                {order.discountTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span className="tabular-nums">-{formatPHP(order.discountTotal)}</span>
                  </div>
                )}
                {order.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery Fee</span>
                    <span className="tabular-nums">{formatPHP(order.deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tax Breakdown</span>
                  <span className="tabular-nums">{formatPHP(order.taxTotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-[#E8DFD3]">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{formatPHP(order.totalAmount)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>Payment Status</span>
                  <span className="uppercase">{order.paymentStatus.replace('_', ' ')}</span>
                </div>
                {order.createdByName && (
                  <div className="flex justify-between">
                    <span>Cashier</span>
                    <span>{order.createdByName}</span>
                  </div>
                )}
              </div>
            )}

            {template === 'customer' && (
              <div className="flex flex-col items-center text-center pt-1 gap-2">
                <QRCodeSVG value={trackingUrl} size={76} />
                <div className="text-[10px] text-[#523B2F]">Scan to track live order status</div>
                <div className="text-[11px] font-sans font-medium pt-1">{business.receiptFooter}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
