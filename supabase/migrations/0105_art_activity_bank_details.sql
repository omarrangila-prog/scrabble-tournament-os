-- The Art Activity is paid into its own account.
update public.events
set data = data || jsonb_build_object('paymentInstructions', E'Bank Al Habib Pvt. Ltd.\nAccount Name: Asma Inayat\nBranch: Clifton (next to Billboard)\nBranch Code: 1019\nAccount #: 1019-0071-010812-01-9\nIBAN: PK16BAHL1019-0071-01081201\n\nAfter transferring, upload the screenshot or receipt below.'),
    updated_at = now()
where id = 'evt-art-activity';
