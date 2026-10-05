/**
 * Invoice Service
 * Generates and manages invoices
 */

const prisma = require('../config/prisma.client');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class InvoiceService {
  /**
   * Generate invoice for a payment
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Invoice details
   */
  async generateInvoice(paymentId) {
    try {
      // Get payment details
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: true,
          relatedListing: true
        }
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Check if invoice already exists
      const existingInvoice = await prisma.invoice.findUnique({
        where: { paymentId }
      });

      if (existingInvoice) {
        return existingInvoice;
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate amounts
      const subtotal = payment.amount;
      const tax = 0; // Pakistan doesn't have VAT on services yet
      const discount = 0;
      const total = subtotal;

      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          paymentId: payment.id,
          userId: payment.userId,
          invoiceNumber,
          subtotal,
          tax,
          discount,
          total,
          currency: payment.currency,
          status: payment.status === 'completed' ? 'paid' : 'draft',
          issueDate: new Date(),
          paidDate: payment.paidAt,
          description: payment.description
        }
      });

      // Generate PDF (async, don't block)
      this.generateInvoicePDF(invoice, payment).catch(err => {
        console.error('PDF generation failed:', err);
      });

      return invoice;
    } catch (error) {
      console.error('Invoice generation error:', error);
      throw error;
    }
  }

  /**
   * Generate unique invoice number
   * @private
   * @returns {Promise<string>} Invoice number (format: INV-2026-000001)
   */
  async generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Get last invoice for this year
    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        invoiceNumber: {
          startsWith: prefix
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    let sequence = 1;
    if (lastInvoice) {
      const lastNumber = lastInvoice.invoiceNumber.split('-')[2];
      sequence = parseInt(lastNumber) + 1;
    }

    return `${prefix}${String(sequence).padStart(6, '0')}`;
  }

  /**
   * Generate PDF invoice
   * @private
   * @param {Object} invoice - Invoice data
   * @param {Object} payment - Payment data
   * @returns {Promise<string>} PDF file path
   */
  async generateInvoicePDF(invoice, payment) {
    return new Promise((resolve, reject) => {
      try {
        // Create PDF
        const doc = new PDFDocument({ margin: 50 });

        // Define file path
        const fileName = `${invoice.invoiceNumber}.pdf`;
        const dirPath = path.join(__dirname, '../../invoices');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, fileName);
        const writeStream = fs.createWriteStream(filePath);

        doc.pipe(writeStream);

        // Add content
        this._addInvoiceHeader(doc);
        this._addInvoiceDetails(doc, invoice, payment);
        this._addInvoiceItems(doc, payment);
        this._addInvoiceFooter(doc, invoice);

        // Finalize PDF
        doc.end();

        writeStream.on('finish', async () => {
          // Update invoice with PDF URL
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { pdfUrl: `/invoices/${fileName}` }
          });

          resolve(filePath);
        });

        writeStream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add invoice header to PDF
   * @private
   */
  _addInvoiceHeader(doc) {
    const companyName = process.env.COMPANY_NAME || 'Real Estate Portal';
    const companyAddress = process.env.COMPANY_ADDRESS || 'Karachi, Pakistan';
    const companyNTN = process.env.COMPANY_NTN || 'NTN: 1234567890';

    doc
      .fontSize(20)
      .text(companyName, 50, 50)
      .fontSize(10)
      .text(companyAddress, 50, 75)
      .text(companyNTN, 50, 90)
      .moveDown();
  }

  /**
   * Add invoice details to PDF
   * @private
   */
  _addInvoiceDetails(doc, invoice, payment) {
    doc
      .fontSize(16)
      .text('INVOICE', 50, 130)
      .fontSize(10)
      .text(`Invoice #: ${invoice.invoiceNumber}`, 50, 155)
      .text(`Issue Date: ${this._formatDate(invoice.issueDate)}`, 50, 170)
      .text(`Payment Date: ${payment.paidAt ? this._formatDate(payment.paidAt) : 'Pending'}`, 50, 185)
      .text(`Status: ${invoice.status.toUpperCase()}`, 50, 200)
      .moveDown();

    // Bill to
    doc
      .fontSize(12)
      .text('Bill To:', 50, 230)
      .fontSize(10)
      .text(payment.user.name, 50, 245)
      .text(payment.user.email, 50, 260);

    if (payment.user.phone) {
      doc.text(payment.user.phone, 50, 275);
    }

    doc.moveDown();
  }

  /**
   * Add invoice items to PDF
   * @private
   */
  _addInvoiceItems(doc, payment) {
    const tableTop = 330;

    // Table header
    doc
      .fontSize(10)
      .text('Description', 50, tableTop, { bold: true })
      .text('Amount', 400, tableTop, { align: 'right' });

    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Item
    const itemY = tableTop + 30;
    doc
      .fontSize(10)
      .text(payment.description, 50, itemY, { width: 300 })
      .text(`${payment.currency} ${this._formatAmount(payment.amount)}`, 400, itemY, { align: 'right' });

    // Totals
    const totalsY = itemY + 50;
    
    doc
      .fontSize(10)
      .text('Subtotal:', 350, totalsY)
      .text(`${payment.currency} ${this._formatAmount(payment.amount)}`, 400, totalsY, { align: 'right' });

    doc
      .text('Tax:', 350, totalsY + 20)
      .text(`${payment.currency} 0.00`, 400, totalsY + 20, { align: 'right' });

    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(350, totalsY + 40)
      .lineTo(550, totalsY + 40)
      .stroke();

    doc
      .fontSize(12)
      .text('Total:', 350, totalsY + 50, { bold: true })
      .text(`${payment.currency} ${this._formatAmount(payment.amount)}`, 400, totalsY + 50, { align: 'right', bold: true });
  }

  /**
   * Add invoice footer to PDF
   * @private
   */
  _addInvoiceFooter(doc, invoice) {
    doc
      .fontSize(8)
      .text('Thank you for your business!', 50, 700, { align: 'center' })
      .text('For support, contact support@yourcompany.com', 50, 715, { align: 'center' });
  }

  /**
   * Format date for display
   * @private
   */
  _formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Format amount for display
   * @private
   */
  _formatAmount(amount) {
    return parseFloat(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /**
   * Get invoice by ID
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<Object>} Invoice details
   */
  async getInvoice(invoiceId) {
    return await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payment: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  /**
   * Get invoices for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of invoices
   */
  async getUserInvoices(userId) {
    return await prisma.invoice.findMany({
      where: { userId },
      include: {
        payment: {
          select: {
            id: true,
            paymentType: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

module.exports = new InvoiceService();
