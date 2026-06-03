/*
  # Add RLS Policies for Chat System

  1. New Policies for chat_rooms table
     - Anyone in the chat room (employer or seeker) can view it
     - Only employers can create chat rooms
     - Users can only view their own chat rooms

  2. New Policies for messages table
     - Users can only view messages in rooms they're part of
     - Only authenticated users can send messages
*/

-- Enable RLS on chat_rooms if not already enabled
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Chat room participants can view" ON chat_rooms;
DROP POLICY IF EXISTS "Employers can create chat rooms" ON chat_rooms;
DROP POLICY IF EXISTS "Chat room participants can view messages" ON messages;
DROP POLICY IF EXISTS "Chat room participants can send messages" ON messages;

-- Chat rooms policies
CREATE POLICY "Chat room participants can view"
  ON chat_rooms FOR SELECT
  TO authenticated
  USING (
    auth.uid() = employer_id OR
    auth.uid() = seeker_id
  );

CREATE POLICY "Employers can create chat rooms"
  ON chat_rooms FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = employer_id AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'employer'
    )
  );

CREATE POLICY "Only participants can update chat rooms"
  ON chat_rooms FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = employer_id OR
    auth.uid() = seeker_id
  )
  WITH CHECK (
    auth.uid() = employer_id OR
    auth.uid() = seeker_id
  );

-- Messages policies
CREATE POLICY "Chat room participants can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = messages.chat_room_id
      AND (
        chat_rooms.employer_id = auth.uid() OR
        chat_rooms.seeker_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authenticated users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = messages.chat_room_id
      AND (
        chat_rooms.employer_id = auth.uid() OR
        chat_rooms.seeker_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);
