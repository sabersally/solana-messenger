use anchor_lang::prelude::*;

declare_id!("msg1jhfewu1hGDnQKGhXDmqas6JZTq7Lg7PbSX5jY9y");

#[program]
pub mod messenger {
    use super::*;

    pub fn send_message(
        ctx: Context<SendMessage>,
        recipient: Pubkey,
        ciphertext: Vec<u8>,
        nonce: [u8; 24],
    ) -> Result<()> {
        require!(ciphertext.len() <= 900, MessengerError::MessageTooLarge);
        require!(!ciphertext.is_empty(), MessengerError::EmptyMessage);

        emit!(MessageSent {
            sender: ctx.accounts.sender.key(),
            recipient,
            ciphertext,
            nonce,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn register(ctx: Context<Register>, encryption_pubkey: Pubkey) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        let now = Clock::get()?.unix_timestamp;
        registry.owner = ctx.accounts.owner.key();
        registry.encryption_key = encryption_pubkey;
        registry.created_at = now;
        registry.updated_at = now;
        Ok(())
    }

    pub fn update_encryption_key(
        ctx: Context<UpdateEncryptionKey>,
        new_encryption_pubkey: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.encryption_key = new_encryption_pubkey;
        registry.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn deregister(_ctx: Context<Deregister>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
}

#[derive(Accounts)]
pub struct Register<'info> {
    #[account(
        init,
        payer = owner,
        space = 88,
        seeds = [b"messenger", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, EncryptionRegistry>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateEncryptionKey<'info> {
    #[account(
        mut,
        seeds = [b"messenger", owner.key().as_ref()],
        bump,
        has_one = owner,
    )]
    pub registry: Account<'info, EncryptionRegistry>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Deregister<'info> {
    #[account(
        mut,
        seeds = [b"messenger", owner.key().as_ref()],
        bump,
        has_one = owner,
        close = owner,
    )]
    pub registry: Account<'info, EncryptionRegistry>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[account]
pub struct EncryptionRegistry {
    pub owner: Pubkey,
    pub encryption_key: Pubkey,
    pub created_at: i64,
    pub updated_at: i64,
}

#[event]
pub struct MessageSent {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; 24],
    pub timestamp: i64,
}

#[error_code]
pub enum MessengerError {
    #[msg("Message exceeds maximum size of 900 bytes")]
    MessageTooLarge,
    #[msg("Message cannot be empty")]
    EmptyMessage,
}
