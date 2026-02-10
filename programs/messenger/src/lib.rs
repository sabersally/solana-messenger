use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("msg1jhfewu1hGDnQKGhXDmqas6JZTq7Lg7PbSX5jY9y");

#[program]
pub mod messenger {
    use super::*;

    /// Initialize the platform config. Can only be called once.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        fee_vault: Pubkey,
        protocol_fee: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.fee_vault = fee_vault;
        config.protocol_fee = protocol_fee;
        config.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Update platform config (authority only).
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_vault: Option<Pubkey>,
        protocol_fee: Option<u64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(vault) = fee_vault {
            config.fee_vault = vault;
        }
        if let Some(fee) = protocol_fee {
            config.protocol_fee = fee;
        }
        config.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Send an encrypted message. Auto-deducts protocol fee + recipient fee.
    pub fn send_message(
        ctx: Context<SendMessage>,
        recipient: Pubkey,
        ciphertext: Vec<u8>,
        nonce: [u8; 24],
    ) -> Result<()> {
        require!(ciphertext.len() <= 900, MessengerError::MessageTooLarge);
        require!(!ciphertext.is_empty(), MessengerError::EmptyMessage);

        // Protocol fee
        let protocol_fee = ctx.accounts.config.protocol_fee;
        if protocol_fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.sender.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                    },
                ),
                protocol_fee,
            )?;
        }

        // Recipient fee (if registry exists and min_fee > 0)
        if let Some(registry) = &ctx.accounts.recipient_registry {
            let min_fee = registry.min_fee;
            if min_fee > 0 {
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.sender.to_account_info(),
                            to: ctx.accounts.recipient_wallet.to_account_info(),
                        },
                    ),
                    min_fee,
                )?;
            }
        }

        emit!(MessageSent {
            sender: ctx.accounts.sender.key(),
            recipient,
            ciphertext,
            nonce,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Register an encryption key and optional minimum fee.
    pub fn register(
        ctx: Context<Register>,
        encryption_pubkey: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        let now = Clock::get()?.unix_timestamp;
        registry.owner = ctx.accounts.owner.key();
        registry.encryption_key = encryption_pubkey;
        registry.min_fee = 0;
        registry.created_at = now;
        registry.updated_at = now;
        Ok(())
    }

    /// Update encryption key.
    pub fn update_encryption_key(
        ctx: Context<UpdateEncryptionKey>,
        new_encryption_pubkey: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.encryption_key = new_encryption_pubkey;
        registry.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Set minimum fee to receive messages.
    pub fn set_min_fee(
        ctx: Context<SetMinFee>,
        min_fee: u64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.min_fee = min_fee;
        registry.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Deregister and reclaim rent.
    pub fn deregister(_ctx: Context<Deregister>) -> Result<()> {
        Ok(())
    }
}

// === Accounts ===

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 8, // discriminator + authority + fee_vault + protocol_fee + updated_at
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump,
        has_one = authority,
    )]
    pub config: Account<'info, PlatformConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, PlatformConfig>,
    /// CHECK: fee vault receives protocol fees, validated against config
    #[account(
        mut,
        constraint = fee_vault.key() == config.fee_vault @ MessengerError::InvalidFeeVault,
    )]
    pub fee_vault: AccountInfo<'info>,
    /// Optional: recipient's registry PDA (for min_fee lookup)
    #[account(
        seeds = [b"messenger", recipient_wallet.key().as_ref()],
        bump,
    )]
    pub recipient_registry: Option<Account<'info, EncryptionRegistry>>,
    /// CHECK: recipient wallet receives min_fee, must match registry owner
    #[account(mut)]
    pub recipient_wallet: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Register<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + 8 + 8 + 8, // discriminator + owner + encryption_key + min_fee + created_at + updated_at
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
pub struct SetMinFee<'info> {
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

// === State ===

#[account]
pub struct PlatformConfig {
    pub authority: Pubkey,      // who can update config
    pub fee_vault: Pubkey,      // where protocol fees go
    pub protocol_fee: u64,      // lamports per message
    pub updated_at: i64,
}

#[account]
pub struct EncryptionRegistry {
    pub owner: Pubkey,
    pub encryption_key: Pubkey,
    pub min_fee: u64,           // minimum lamports to receive a message
    pub created_at: i64,
    pub updated_at: i64,
}

// === Events ===

#[event]
pub struct MessageSent {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; 24],
    pub timestamp: i64,
}

// === Errors ===

#[error_code]
pub enum MessengerError {
    #[msg("Message exceeds maximum size of 900 bytes")]
    MessageTooLarge,
    #[msg("Message cannot be empty")]
    EmptyMessage,
    #[msg("Fee vault does not match platform config")]
    InvalidFeeVault,
}
