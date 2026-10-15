-- Porur's invoice/quotation code is now "P" (was the client's example "1MH"). Invoices already issued keep their numbers.
UPDATE "branches" SET "code" = 'P' WHERE "id" = 'Branch 2' AND "code" = '1MH';
