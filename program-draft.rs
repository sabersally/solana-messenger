use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111"); // placeholder

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
        require!(ciphertext.len() > 0, MessengerError::EmptyMessage);

        emit!(MessageSent {
            sender: ctx.accounts.sender.key(),
            recipient,
            ciphertext,
            nonce,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
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
