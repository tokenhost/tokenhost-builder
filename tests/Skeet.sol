//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

contract Skeet_contract {
    uint256 timestamp;
    address sender;
    string text;
    address image;

    constructor(string memory _text, address _image) {
        sender = tx.origin;
        timestamp = block.timestamp;
        text = _text;
        image = _image;
    }

    function getall()
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory,
            address
        )
    {
        return (address(this), timestamp, sender, text, image);
    }

    function get_timestamp() public view returns (uint256) {
        return timestamp;
    }

    function get_sender() public view returns (address) {
        return sender;
    }

    function get_text() public view returns (string memory) {
        return text;
    }

    function get_image() public view returns (address) {
        return image;
    }
}

contract Follows_contract {
    uint256 timestamp;
    address sender;
    address alice;
    address bob;

    constructor(address _alice, address _bob) {
        sender = tx.origin;
        timestamp = block.timestamp;
        alice = _alice;
        bob = _bob;
    }

    function getall()
        public
        view
        returns (
            address,
            uint256,
            address,
            address,
            address
        )
    {
        return (address(this), timestamp, sender, alice, bob);
    }

    function get_timestamp() public view returns (uint256) {
        return timestamp;
    }

    function get_sender() public view returns (address) {
        return sender;
    }

    function get_alice() public view returns (address) {
        return alice;
    }

    function get_bob() public view returns (address) {
        return bob;
    }
}

contract App {
    address[] Skeet_list;
    uint256 Skeet_list_length;

    function get_Skeet_list_length() public view returns (uint256) {
        return Skeet_list_length;
    }

    struct Skeet_getter {
        address _address;
        uint256 timestamp;
        address sender;
        string text;
        address image;
    }

    function get_Skeet_N(uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory,
            address
        )
    {
        return Skeet_contract(Skeet_list[index]).getall();
    }

    function get_first_Skeet_N(uint256 count, uint256 offset)
        public
        view
        returns (Skeet_getter[] memory)
    {
        Skeet_getter[] memory getters = new Skeet_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            Skeet_contract mySkeet = Skeet_contract(Skeet_list[i + offset]);
            getters[i - offset]._address = address(mySkeet);
            getters[i - offset].timestamp = mySkeet.get_timestamp();
            getters[i - offset].sender = mySkeet.get_sender();
            getters[i - offset].text = mySkeet.get_text();
            getters[i - offset].image = mySkeet.get_image();
        }
        return getters;
    }

    function get_last_Skeet_N(uint256 count, uint256 offset)
        public
        view
        returns (Skeet_getter[] memory)
    {
        Skeet_getter[] memory getters = new Skeet_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            Skeet_contract mySkeet =
                Skeet_contract(Skeet_list[Skeet_list_length - i - offset - 1]);
            getters[i]._address = address(mySkeet);

            getters[i].timestamp = mySkeet.get_timestamp();
            getters[i].sender = mySkeet.get_sender();
            getters[i].text = mySkeet.get_text();
            getters[i].image = mySkeet.get_image();
        }
        return getters;
    }

    function get_Skeet_user_length(address user) public view returns (uint256) {
        return user_map[user].Skeet_list_length;
    }

    function get_Skeet_user_N(address user, uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory,
            address
        )
    {
        return Skeet_contract(user_map[user].Skeet_list[index]).getall();
    }

    function get_last_Skeet_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (Skeet_getter[] memory) {
        Skeet_getter[] memory getters = new Skeet_getter[](count);

        for (uint256 i = offset; i < count; i++) {
            getters[i - offset]._address = user_map[user].Skeet_list[
                i + offset
            ];
            getters[i - offset].timestamp = Skeet_contract(
                user_map[user].Skeet_list[i + offset]
            )
                .get_timestamp();
            getters[i - offset].sender = Skeet_contract(
                user_map[user].Skeet_list[i + offset]
            )
                .get_sender();
            getters[i - offset].text = Skeet_contract(
                user_map[user].Skeet_list[i + offset]
            )
                .get_text();
            getters[i - offset].image = Skeet_contract(
                user_map[user].Skeet_list[i + offset]
            )
                .get_image();
        }
        return getters;
    }

    address[] Follows_list;
    uint256 Follows_list_length;

    function get_Follows_list_length() public view returns (uint256) {
        return Follows_list_length;
    }

    struct Follows_getter {
        address _address;
        uint256 timestamp;
        address sender;
        address alice;
        address bob;
    }

    function get_Follows_N(uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            address,
            address
        )
    {
        return Follows_contract(Follows_list[index]).getall();
    }

    function get_first_Follows_N(uint256 count, uint256 offset)
        public
        view
        returns (Follows_getter[] memory)
    {
        Follows_getter[] memory getters = new Follows_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            Follows_contract myFollows =
                Follows_contract(Follows_list[i + offset]);
            getters[i - offset]._address = address(myFollows);
            getters[i - offset].timestamp = myFollows.get_timestamp();
            getters[i - offset].sender = myFollows.get_sender();
            getters[i - offset].alice = myFollows.get_alice();
            getters[i - offset].bob = myFollows.get_bob();
        }
        return getters;
    }

    function get_last_Follows_N(uint256 count, uint256 offset)
        public
        view
        returns (Follows_getter[] memory)
    {
        Follows_getter[] memory getters = new Follows_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            Follows_contract myFollows =
                Follows_contract(
                    Follows_list[Follows_list_length - i - offset - 1]
                );
            getters[i]._address = address(myFollows);

            getters[i].timestamp = myFollows.get_timestamp();
            getters[i].sender = myFollows.get_sender();
            getters[i].alice = myFollows.get_alice();
            getters[i].bob = myFollows.get_bob();
        }
        return getters;
    }

    function get_Follows_user_length(address user)
        public
        view
        returns (uint256)
    {
        return user_map[user].Follows_list_length;
    }

    function get_Follows_user_N(address user, uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            address,
            address
        )
    {
        return Follows_contract(user_map[user].Follows_list[index]).getall();
    }

    function get_last_Follows_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (Follows_getter[] memory) {
        Follows_getter[] memory getters = new Follows_getter[](count);

        for (uint256 i = offset; i < count; i++) {
            getters[i - offset]._address = user_map[user].Follows_list[
                i + offset
            ];
            getters[i - offset].timestamp = Follows_contract(
                user_map[user].Follows_list[i + offset]
            )
                .get_timestamp();
            getters[i - offset].sender = Follows_contract(
                user_map[user].Follows_list[i + offset]
            )
                .get_sender();
            getters[i - offset].alice = Follows_contract(
                user_map[user].Follows_list[i + offset]
            )
                .get_alice();
            getters[i - offset].bob = Follows_contract(
                user_map[user].Follows_list[i + offset]
            )
                .get_bob();
        }
        return getters;
    }

    struct Skeet_image {
        bool exists;
        address[] Skeet_list;
    }
    mapping(address => Skeet_image) public Skeet_image_map;

    function get_length_Skeet_image_map(address hash)
        public
        view
        returns (uint256)
    {
        return Skeet_image_map[hash].Skeet_list.length;
    }

    function get_last_Skeet_image_map_N(
        address hash,
        uint256 count,
        uint256 offset
    ) public view returns (Skeet_getter[] memory) {
        Skeet_getter[] memory getters = new Skeet_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            Skeet_contract mySkeet =
                Skeet_contract(
                    Skeet_image_map[hash].Skeet_list[
                        Skeet_image_map[hash].Skeet_list.length - i - offset - 1
                    ]
                );

            getters[i]._address = address(mySkeet);

            getters[i].timestamp = mySkeet.get_timestamp();
            getters[i].sender = mySkeet.get_sender();
            getters[i].text = mySkeet.get_text();
            getters[i].image = mySkeet.get_image();
        }
        return getters;
    }

    struct UserInfo {
        address owner;
        bool exists;
        address[] Skeet_list;
        uint256 Skeet_list_length;
        address[] Follows_list;
        uint256 Follows_list_length;
    }
    mapping(address => UserInfo) public user_map;
    address[] UserInfoList;
    uint256 UserInfoListLength;

    event NewSkeet(address sender);

    function new_Skeet(string memory text, address image)
        public
        returns (address)
    {
        address mynew =
            address(new Skeet_contract({_text: text, _image: image}));

        if (!Skeet_image_map[image].exists) {
            Skeet_image_map[image] = create_index_on_new_Skeet_image();
        }
        Skeet_image_map[image].Skeet_list.push(mynew);

        if (!user_map[tx.origin].exists) {
            user_map[tx.origin] = create_user_on_new_Skeet(mynew);
        }
        user_map[tx.origin].Skeet_list.push(mynew);

        user_map[tx.origin].Skeet_list_length += 1;

        Skeet_list.push(mynew);
        Skeet_list_length += 1;

        emit NewSkeet(tx.origin);

        return mynew;
    }

    function create_user_on_new_Skeet(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory Skeet_list_;

        address[] memory Follows_list_;

        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                Skeet_list: Skeet_list_,
                Skeet_list_length: 0,
                Follows_list: Follows_list_,
                Follows_list_length: 0
            });
    }

    function create_index_on_new_Skeet_image()
        private
        pure
        returns (Skeet_image memory)
    {
        address[] memory tmp;
        return Skeet_image({exists: true, Skeet_list: tmp});
    }

    event NewFollows(address sender);

    mapping(bytes32 => address) unique_map_Follows;

    function get_unique_map_Follows(address alice, address bob)
        public
        view
        returns (address)
    {
        bytes32 hash_Follows = keccak256(abi.encodePacked(alice, bob));
        return unique_map_Follows[hash_Follows];
    }

    function new_Follows(address alice, address bob) public returns (address) {
        bytes32 hash_Follows = keccak256(abi.encodePacked(alice, bob));

        require(unique_map_Follows[hash_Follows] == address(0));

        address mynew =
            address(new Follows_contract({_alice: alice, _bob: bob}));
        unique_map_Follows[hash_Follows] = mynew;

        if (!user_map[tx.origin].exists) {
            user_map[tx.origin] = create_user_on_new_Follows(mynew);
        }
        user_map[tx.origin].Follows_list.push(mynew);

        user_map[tx.origin].Follows_list_length += 1;

        Follows_list.push(mynew);
        Follows_list_length += 1;

        emit NewFollows(tx.origin);

        return mynew;
    }

    function create_user_on_new_Follows(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory Skeet_list_;

        address[] memory Follows_list_;

        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                Skeet_list: Skeet_list_,
                Skeet_list_length: 0,
                Follows_list: Follows_list_,
                Follows_list_length: 0
            });
    }
}
